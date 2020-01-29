// TODO: should this be .ts or .tsx ?

import Web3 from 'web3';
import BN from 'bn.js';
import { computed, observable } from 'mobx';
import { BlockHeader } from 'web3-eth';
import { AbiItem } from 'web3-utils';
import { abi as ValidatorSetAbi } from '../contract-abis/ValidatorSetAuRa.json';
import { abi as StakingAbi } from '../contract-abis/StakingAuRaCoins.json';
import { abi as BlockRewardAbi } from '../contract-abis/BlockRewardAuRaCoins.json';
import { ValidatorSetAuRa } from '../contracts/ValidatorSetAuRa';
import { StakingAuRaCoins } from '../contracts/StakingAuRaCoins';
import { BlockRewardAuRaCoins } from '../contracts/BlockRewardAuRaCoins';

// needed for querying injected web3 (e.g. from Metamask)
declare global {
  interface Window {
    ethereum: Web3;
    web3: Web3;
  }
}

// for debug
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare let window: any;
window.BN = BN;

type Address = string;

// TODO: check this instead: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/call
declare global {
  interface String {
    print(): string; // in ATS units
    asNumber(): number; // in ATS units
    isAddress(): boolean;
  }
}

// TODO: can this be added to the Amount type only (instead of String) without complicating usage?
// eslint-disable-next-line no-extend-native,@typescript-eslint/explicit-function-return-type,func-names
String.prototype.print = function (this: string) {
  const nr = this.asNumber();
  return Math.trunc(nr) === nr ? nr.toString() : nr.toFixed(2);
};
// eslint-disable-next-line no-extend-native,@typescript-eslint/explicit-function-return-type,func-names
String.prototype.asNumber = function (this: string) {
  const web3 = new Web3();
  return parseFloat(web3.utils.fromWei(this));
};
// eslint-disable-next-line no-extend-native,@typescript-eslint/explicit-function-return-type,func-names
String.prototype.isAddress = function (this: string) {
  const web3 = new Web3();
  return web3.utils.isAddress(this);
};

type Amount = string;

interface IDelegator {
  address: Address;
}

// TODO: be consistent about type (string vs BN vs number) and unit (ATS vs wei) for amounts

// TODO: when is it worth it creating a class / dedicated file?
export interface IPool {
  isActive: boolean; // currently "active" pool
  readonly stakingAddress: Address;
  miningAddress: Address;
  addedInEpoch: number;
  isCurrentValidator: boolean;
  candidateStake: Amount;
  totalStake: Amount;
  myStake: Amount;
  claimableStake: {
    amount: Amount;
    unlockEpoch: number;
    canClaimNow(): boolean;
  };
  delegators: Array<IDelegator>; // TODO: how to cast to Array<IDelegator> ?
  isMe: boolean;
  validatorStakeShare: number; // percent
  validatorRewardShare: number; // percent
  claimableReward: Amount;
  isBanned(): boolean;
  bannedUntilEpoch: number;
  banCount: number;
  blocksAuthored: number;
}

// TODO: dry-run / estimate gas before sending actual transactions
export default class Context {
  @observable public currentBlockNumber!: number;

  @observable public myAddr!: Address;

  // in Ether (not wei!)
  // TODO: initializing to 0 is a lazy shortcut
  @observable public myBalance: Amount = '0';

  public epochDuration!: number;

  public candidateMinStake!: Amount;

  public delegatorMinStake!: Amount;

  @observable public stakingEpoch!: number;

  // TODO: find better name
  @observable public canStakeOrWithdrawNow = false;

  // positive value: allowed for n more blocks
  // negative value: allowed in n blocks
  @observable public stakingAllowedTimeframe = 0;

  @observable public isSyncingPools = true;

  @observable public pools!: IPool[];

  @observable public currentValidators: Address[] = [];

  // TODO: properly implement singleton pattern
  // eslint-disable-next-line max-len
  public static async initialize(wsUrl: URL, validatorSetContractAddress: Address): Promise<Context> {
    const ctx = new Context();
    ctx.web3WS = new Web3(wsUrl.toString());

    // doc: https://metamask.github.io/metamask-docs/API_Reference/Ethereum_Provider
    if (!window.ethereum) {
      throw Error('no web3 injected');
    }

    ctx.web3 = new Web3(window.ethereum);
    ctx.myAddr = ctx.web3.utils.toChecksumAddress((await window.ethereum.enable())[0]);

    // debug
    window.web3 = ctx.web3;

    window.ethereum.on('accountsChanged', (accounts: Account[]) => {
      alert(`metamask account changed to ${accounts}. You may want to reload...`);
    });

    window.ethereum.on('chainChanged', (chainId: number) => {
      alert(`metamask chain changed to ${chainId}. You may want to reload...`);
    });

    ctx.defaultTxOpts.from = ctx.myAddr;

    await ctx.initContracts(validatorSetContractAddress);

    return ctx;
  }

  @computed get myPool(): IPool | undefined {
    return this.pools.filter((p) => p.stakingAddress === this.myAddr)[0];
  }

  @computed
  public get iHaveAPool(): boolean {
    return this.myPool !== undefined;
  }

  // checks if the given addresses can be used for creating a pool
  public async areAddressesValidForCreatePool(stakingAddr: Address, miningAddr: Address): Promise<boolean> {
    // same checks as in ValidatorSet._setStakingAddress()
    return (
      stakingAddr !== miningAddr
      && await this.vsContract.methods.miningByStakingAddress(stakingAddr).call() === '0x0000000000000000000000000000000000000000'
      && await this.vsContract.methods.miningByStakingAddress(miningAddr).call() === '0x0000000000000000000000000000000000000000'
      && await this.vsContract.methods.stakingByMiningAddress(stakingAddr).call() === '0x0000000000000000000000000000000000000000'
      && await this.vsContract.methods.stakingByMiningAddress(miningAddr).call() === '0x0000000000000000000000000000000000000000'
    );
  }

  /** creates a pool for the sender account, making the sender account a posdao "candidate"
   * The caller is responsible for parameter validity, checking sender balance etc.
   * @parm initialStake amount (in ATS) of initial candidate stake
   * TODO: figure out return type and how to deal with asynchrony and errors
   */
  public async createPool(miningKeyAddr: Address, initialStake: number): Promise<void> {
    console.log(`${this.myAddr} wants to add Pool with initial stake ${initialStake}`);

    if (!this.canStakeOrWithdrawNow) {
      return;
    }

    const txOpts = this.defaultTxOpts;
    txOpts.value = this.web3.utils.toWei(initialStake.toString());

    try {
      // <amount> argument is ignored by the contract (exists for chains with token based staking)
      const receipt = await this.stContract.methods.addPool(0, miningKeyAddr).send(txOpts);
      console.log(`receipt: ${JSON.stringify(receipt, null, 2)}`);
    } catch (e) {
      console.log(`failed with ${e}`);
    }
  }

  // stake the given amount (in ATS) on the given pool (identified by staking address)
  // TODO: use Amount type, but make sure it's in wei
  // TODO: figure out return type and how to deal with asynchrony and errors
  public async stake(poolAddr: Address, amount: number): Promise<void> {
    console.log(`${this.myAddr} wants to stake ${amount} ATS on pool ${poolAddr}`);

    if (!this.canStakeOrWithdrawNow) {
      return;
    }

    const txOpts = this.defaultTxOpts;
    txOpts.value = this.web3.utils.toWei(amount.toString());

    try {
      // amount is ignored
      const receipt = await this.stContract.methods.stake(poolAddr, 0).send(txOpts);
      // console.log(`receipt: ${JSON.stringify(receipt, null, 2)}`);
      console.log(`tx ${receipt.transactionHash} for stake(): block ${receipt.blockNumber}, ${receipt.gasUsed} gas`);
    } catch (e) {
      console.log(`failed with ${e}`);
    }
  }

  /**
   * Allows stakes to be moved to another pool in a single transaction (instead of withdraw() + stake())
   * Available only while fromPool is NOT in the validator set AND during staking epoch
   */
  public async moveStake(fromPoolAddr: Address, toPoolAddr: Address, amount: number): Promise<void> {
    console.log(`${this.myAddr} wants to move ${amount} ATS from pool ${fromPoolAddr} to ${toPoolAddr}`);

    if (!this.canStakeOrWithdrawNow) {
      return;
    }

    const txOpts = this.defaultTxOpts;
    const amountWei = this.web3.utils.toWei(amount.toString());

    try {
      // amount is ignored
      const receipt = await this.stContract.methods.moveStake(fromPoolAddr, toPoolAddr, amountWei).send(txOpts);
      // console.log(`receipt: ${JSON.stringify(receipt, null, 2)}`);
      console.log(`tx ${receipt.transactionHash} for moveStake(): block ${receipt.blockNumber}, ${receipt.gasUsed} gas`);
    } catch (e) {
      console.log(`failed with ${e}`);
    }
  }

  /** withraw the given amount (in ATS) from the given pool (identified by staking address)
   *
   * A withdrawal can happen in 2 ways:
   * a) If the given pool is in the current or in the next validator set, withdraw() "orders" a withdrawal.
   *    The given amount is then available to be "claimed" (additional transaction) from the next epoch onward.
   * b) If the given pool is NOT in the current or in the next validator set, withdraw() already transfers the
   *    given amount to the staking address - no second step needed.
   *
   * This method automatically determines and executes the right smart contract method to be used.
   * It's up to the caller to claim ordered withdrawals at a later time if needed.
   *
   * TODO: deal with frozen stakes due to banned pools
   *
   * @param poolAddr: address of the pool from which to withdraw part or all of the stake
   * @param amount: the amount to be withdrawn (in ATS units). Needs to be <= the current stake in that pool
   *
   * @return true if a consecutive claim transaction is needed in order to transfer the requested amount
   */
  // TODO: refactor to reduce redundancy with method stake()
  public async withdraw(poolAddr: Address, amount: number): Promise<boolean> {
    console.log(`${this.myAddr} wants to withdraw ${amount} ATS from pool ${poolAddr}`);

    console.assert(this.canStakeOrWithdrawNow, 'withdraw currently not allowed');

    const txOpts = this.defaultTxOpts;
    const amountWeiBN: BN = this.web3.utils.toWei(new BN(amount));

    // determine available withdraw method and allowed amount
    const maxWithdrawAmount = await this.stContract.methods.maxWithdrawAllowed(poolAddr, this.myAddr).call();
    const maxWithdrawOrderAmount = await this.stContract.methods.maxWithdrawOrderAllowed(poolAddr, this.myAddr).call();
    console.assert(maxWithdrawAmount === '0' || maxWithdrawOrderAmount === '0', 'max withdraw amount assumption violated');

    try {
      if (maxWithdrawAmount !== '0') {
        console.assert(new BN(maxWithdrawAmount).gte(amountWeiBN), 'requested withdraw amount exceeds max');
        const receipt = await this.stContract.methods.withdraw(poolAddr, amountWeiBN.toString()).send(txOpts);
        console.log(`tx ${receipt.transactionHash} for withdraw(): block ${receipt.blockNumber}, ${receipt.gasUsed} gas`);
      } else {
        console.assert(new BN(maxWithdrawOrderAmount).gte(amountWeiBN), 'requested withdraw order amount exceeds max');
        const receipt = await this.stContract.methods.orderWithdraw(poolAddr, amountWeiBN.toString()).send(txOpts);
        console.log(`tx ${receipt.transactionHash} for orderWithdraw(): block ${receipt.blockNumber}, ${receipt.gasUsed} gas`);
        return true;
      }
    } catch (e) {
      console.log(`failed with ${e}`);
    }
    return false;
  }

  /** claims a previously ordered withdraw, triggering transfer of the full available amount
   * It's the caller's responsibility to determine if there's something to be claimed before calling this method.
   */
  public async claimStake(poolAddr: Address): Promise<void> {
    console.log(`${this.myAddr} wants to claim the available stake from pool ${poolAddr}`);
    console.assert(this.canStakeOrWithdrawNow, 'withdraw currently not allowed');
    const txOpts = this.defaultTxOpts;

    try {
      const receipt = await this.stContract.methods.claimOrderedWithdraw(poolAddr).send(txOpts);
      console.log(`tx ${receipt.transactionHash} for claimOrderedWithdraw(): block ${receipt.blockNumber}, ${receipt.gasUsed} gas`);
    } catch (e) {
      console.log(`failed with ${e}`);
    }
  }

  /**
   * Claims the collected block reward from the given pool
   */
  public async claimReward(poolAddr: Address): Promise<void> {
    console.log(`${this.myAddr} wants to claim the available reward from pool ${poolAddr}`);
    const txOpts = this.defaultTxOpts;

    try {
      // TODO: this can run out of gas (after too many epochs). Solution: break down into multiple txs
      const receipt = await this.stContract.methods.claimReward([], poolAddr).send(txOpts);
      console.log(`tx ${receipt.transactionHash} for claimReward(): block ${receipt.blockNumber}, ${receipt.gasUsed} gas`);
    } catch (e) {
      console.log(`failed with ${e}`);
    }
  }

  // ============================= PRIVATE INTERFACE ==================================

  // connection provided via Metamask.
  private web3: Web3;

  // additional websocket connection for better subscription performance - see https://github.com/MetaMask/metamask-extension/issues/1645
  // TODO: make sure both web3 instances get connected to the same network
  private web3WS: Web3;

  // TODO: find better names for the contract instances
  private vsContract!: ValidatorSetAuRa;

  private stContract!: StakingAuRaCoins;

  private brContract!: BlockRewardAuRaCoins;

  // start block of the first epoch (epoch 0) since posdao was activated
  private posdaoStartBlock!: number;

  // TODO: we should probably get rid of either start or end block, can be calculated with epochDuration
  private stakingEpochStartBlock!: number;

  private stakingEpochEndBlock!: number;

  private stakeWithdrawDisallowPeriod!: number;

  // <from> is set when initializing
  // TODO: anything else? Should we make it configurable?
  private defaultTxOpts = {
    from: '', gasPrice: '20000000000', gasLimit: '6000000', value: '0',
  };

  private constructor() {
    this.web3 = new Web3();
    this.web3WS = new Web3();
  }

  private async initContracts(validatorSetContractAddress: Address): Promise<void> {
    try {
      // TODO: if a contract call fails, the stack trace doesn't show the actual line number.
      this.vsContract = new this.web3.eth.Contract((ValidatorSetAbi as AbiItem[]), validatorSetContractAddress);
      const stAddress = await this.vsContract.methods.stakingContract().call();
      this.stContract = new this.web3.eth.Contract((StakingAbi as AbiItem[]), stAddress);
      const brAddress = await this.vsContract.methods.blockRewardContract().call();
      this.brContract = new this.web3.eth.Contract((BlockRewardAbi as AbiItem[]), brAddress);
    } catch (e) {
      console.log(`initializing contracts failed: ${e}`);
      throw e;
    }

    this.candidateMinStake = await this.stContract.methods.candidateMinStake().call();
    this.delegatorMinStake = await this.stContract.methods.delegatorMinStake().call();

    this.epochDuration = parseInt(await this.stContract.methods.stakingEpochDuration().call());
    this.stakingEpoch = parseInt(await this.stContract.methods.stakingEpoch().call());
    this.stakingEpochStartBlock = parseInt(await this.stContract.methods.stakingEpochStartBlock().call());
    this.stakingEpochEndBlock = parseInt(await this.stContract.methods.stakingEpochEndBlock().call());
    this.stakeWithdrawDisallowPeriod = parseInt(await this.stContract.methods.stakeWithdrawDisallowPeriod().call());

    this.posdaoStartBlock = this.stakingEpochStartBlock - this.stakingEpoch * this.epochDuration;

    await this.subscribeToEvents(this.web3WS);

    await this.syncPoolsState();
    this.isSyncingPools = false;
  }

  // (re-)builds the data structure this.pools based on the current state on chain
  // This may become overkill in a busy system. It should be possible to do more fine-grained updates instead.
  // But for a start, this does the job.
  private async syncPoolsState(): Promise<void> {
    this.pools = [];
    const activePoolAddrs: Array<string> = await this.stContract.methods.getPools().call();
    const inactivePoolAddrs: Array<string> = await this.stContract.methods.getPoolsInactive().call();
    console.log(`syncing ${activePoolAddrs.length} active and ${inactivePoolAddrs.length} inactive pools...`);
    const poolAddrs = activePoolAddrs.concat(inactivePoolAddrs);
    poolAddrs.forEach(async (stakingAddress) => {
      console.log(`checking pool ${stakingAddress}`);
      const miningAddress = await this.vsContract.methods.miningByStakingAddress(stakingAddress).call();
      const candidateStake = await this.stContract.methods.stakeAmount(stakingAddress, stakingAddress).call();
      const totalStake = await this.stContract.methods.stakeAmountTotal(stakingAddress).call();
      const myStake = await this.stContract.methods.stakeAmount(stakingAddress, this.myAddr).call();

      const claimableStake = {
        amount: await this.stContract.methods.orderedWithdrawAmount(stakingAddress, this.myAddr).call(),
        unlockEpoch: parseInt(await this.stContract.methods.orderWithdrawEpoch(stakingAddress, this.myAddr).call()) + 1,
        // this lightweigt solution works, but will not trigger an update by itself when its value changes
        canClaimNow: () => claimableStake.amount.asNumber() > 0 && claimableStake.unlockEpoch <= this.stakingEpoch,
      };

      const delegatorAddrs: Array<string> = await this.stContract.methods.poolDelegators(stakingAddress).call();
      const bannedUntilBlock = parseInt(await this.vsContract.methods.bannedUntil(miningAddress).call());
      // TODO: is rounding up what we want?
      const bannedUntilEpoch = this.stakingEpoch
        + Math.ceil((bannedUntilBlock - this.stakingEpochStartBlock) / this.epochDuration);
      const banCount = parseInt(await this.vsContract.methods.banCounter(miningAddress).call());

      const stEvents = await this.stContract.getPastEvents('allEvents', { fromBlock: 0 });
      // there are between 1 and n AddedPool events per pool. We're looking for the first one
      const poolAddedEvent = stEvents.filter((e) => e.event === 'AddedPool' && e.returnValues.poolStakingAddress === stakingAddress)
        .sort((e1, e2) => e1.blockNumber - e2.blockNumber);
      console.assert(poolAddedEvent.length > 0, `no AddedPool event found for ${stakingAddress}`);
      // result can be negative for pools added as "initial validators", thus setting 0 as min value
      const addedInEpoch = Math.max(0, Math.floor((poolAddedEvent[0].blockNumber - this.posdaoStartBlock) / this.epochDuration));

      // fetch and add the number of blocks authored per epoch since this pool was created
      const blocksAuthored = await [...Array(this.stakingEpoch - addedInEpoch)]
        .map(async (_, i) => parseInt(await this.brContract.methods.blocksCreated(this.stakingEpoch - i, miningAddress).call()))
        .reduce(async (acc, cur) => await acc + await cur);


      const newPool = {
        isActive: activePoolAddrs.indexOf(stakingAddress) >= 0,
        miningAddress,
        isCurrentValidator: this.isCurrentValidator(miningAddress),
        stakingAddress,
        candidateStake,
        totalStake,
        myStake,
        claimableStake,
        delegators: delegatorAddrs.map((addr) => ({ address: addr })),
        isMe: stakingAddress === this.myAddr,
        validatorRewardShare: await this.getValidatorRewardShare(stakingAddress),
        validatorStakeShare: await this.getValidatorStakeShare(miningAddress),
        claimableReward: await this.getClaimableReward(stakingAddress),
        bannedUntilEpoch,
        isBanned: () => bannedUntilBlock > this.currentBlockNumber,
        banCount,
        addedInEpoch,
        blocksAuthored,
      };
      this.pools.push(newPool);
    });
  }

  // flags pools in the current validator set.
  // TODO: make this more robust (currently depends on assumption about the order of event handling)
  private async updateCurrentValidators(): Promise<void> {
    const newCurrentValidators = (await this.vsContract.methods.getValidators().call()).sort();
    // make sure both arrays were sorted beforehand
    if (this.currentValidators.toString() !== newCurrentValidators.toString()) {
      console.log(`validator set changed in block ${this.currentBlockNumber}`);
      this.currentValidators = newCurrentValidators;
      // update pools accordingly
      this.pools.forEach((p) => {
        console.log(`updating validator state for ${p.stakingAddress}`);
        p.isCurrentValidator = newCurrentValidators.indexOf(p.miningAddress) >= 0;
      });
    }
  }

  private async getValidatorStakeShare(miningAddr: Address): Promise<number> {
    const vStake = await this.brContract.methods.snapshotPoolValidatorStakeAmount(this.stakingEpoch, miningAddr).call();
    const totalStake = await this.brContract.methods.snapshotPoolTotalStakeAmount(this.stakingEpoch, miningAddr).call();
    return (vStake.asNumber() * 100) / totalStake.asNumber();
  }

  private async getValidatorRewardShare(stakingAddr: Address): Promise<number> {
    return parseInt(await this.brContract.methods.validatorRewardPercent(stakingAddr).call()) / 10000;
  }

  private async getClaimableReward(stakingAddr: Address): Promise<Amount> {
    // getRewardAmount() fails if invoked for a staker without stake in the pool, thus we check that beforehand
    const hasStake: boolean = stakingAddr === this.myAddr ? true : (await this.stContract.methods.stakeFirstEpoch(stakingAddr, this.myAddr).call()) !== '0';
    return hasStake ? this.stContract.methods.getRewardAmount([], stakingAddr, this.myAddr).call() : '0';
  }

  private async handleNewEpoch(): Promise<void> {
    console.log(`new epoch: ${this.stakingEpoch}`);
    await this.pools.forEach(async (pool) => {
      pool.validatorStakeShare = await this.getValidatorStakeShare(pool.miningAddress);
      pool.validatorRewardShare = await this.getValidatorRewardShare(pool.stakingAddress);
      pool.claimableReward = await this.getClaimableReward(pool.stakingAddress);
    });
  }

  // returns true if the given pool is in the current ValidatorSet
  private isCurrentValidator(miningAddr: Address): boolean {
    return this.currentValidators.indexOf(miningAddr) >= 0;
  }

  // does relevant state updates and checks if the epoch changed
  private async handleNewBlock(web3Instance: Web3, blockHeader: BlockHeader): Promise<void> {
    this.currentBlockNumber = blockHeader.number;
    this.myBalance = await web3Instance.eth.getBalance(this.myAddr);

    // epoch change
    if (this.currentBlockNumber > this.stakingEpochEndBlock) {
      console.log(`updating stakingEpochEndBlock at block ${this.currentBlockNumber}`);
      this.stakingEpochStartBlock = parseInt(await this.stContract.methods.stakingEpochStartBlock().call());
      this.stakingEpochEndBlock = parseInt(await this.stContract.methods.stakingEpochEndBlock().call());
      const newStakingEpoch = parseInt(await this.stContract.methods.stakingEpoch().call());
      if (newStakingEpoch !== this.stakingEpoch) {
        this.stakingEpoch = newStakingEpoch;
        await this.handleNewEpoch();
      }
    }

    const blocksLeftInEpoch = this.stakingEpochEndBlock - this.currentBlockNumber;
    if (blocksLeftInEpoch < 0) {
      // TODO: we should have a contract instance connected via websocket in order to avoid this delay
      console.log('stakingEpochEndBlock in the past :-/');
    } else if (blocksLeftInEpoch > this.stakeWithdrawDisallowPeriod) {
      this.stakingAllowedTimeframe = blocksLeftInEpoch - this.stakeWithdrawDisallowPeriod;
    } else {
      this.stakingAllowedTimeframe = -blocksLeftInEpoch;
    }

    // TODO: due to the use of 2 different web3 instances, this bool may not always match stakingAllowedTimeframe
    this.canStakeOrWithdrawNow = await this.stContract.methods.areStakeAndWithdrawAllowed().call();

    // TODO: don't do this in every block. There's no event we can rely on, but we can be smarter than this
    await this.updateCurrentValidators();
  }

  private handledStEvents = new Set<number>();
  // listens for events we're interested in and triggers actions accordingly
  // TODO: does the mix of 2 web3 instances as event source cause troubles?
  private async subscribeToEvents(web3Instance: Web3): Promise<void> {
    this.currentBlockNumber = await web3Instance.eth.getBlockNumber();
    web3Instance.eth.subscribe('newBlockHeaders', async (error, blockHeader) => {
      if (error) {
        console.error(error);
        throw Error(`block listener error: ${error}`);
      }
      await this.handleNewBlock(web3Instance, blockHeader);
    });

    this.stContract.events.allEvents({}, async (error, event) => {
      if (error) {
        console.log(`event error: ${error}`);
      } else if (this.handledStEvents.has(event.blockNumber)) {
        console.log(`staking contract event for block ${event.blockNumber} already handled, ignoring`);
      } else {
        this.handledStEvents.add(event.blockNumber);
        console.log(`staking contract event ${event.event} originating from ${event.address} at block ${event.blockNumber}`);
        this.isSyncingPools = true;
        await this.syncPoolsState();
        this.isSyncingPools = false;
      }
    });

    // listen to InitiateChange events. Those signal Parity to switch validator set.
    // for logging purposes only at the moment
    // re-read pools on any contract event
    this.vsContract.events.InitiateChange({}, async (error, event) => {
      if (error) {
        console.log(`event error: ${error}`);
      } else {
        console.log(`validatorset contract event ${event.event} at block ${event.blockNumber}`);
        // TODO: if any handler is added here, make sure it's not triggered more than once per block
      }
    });
  }
}
