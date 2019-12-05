// TODO: should this be .ts or .tsx ?

// TODO: reduce use of "any" type

import Web3 from 'web3';
import { computed, observable } from 'mobx';
import * as ValidatorSetBuildfile from '../contracts/ValidatorSetAuRa.json';
import * as StakingBuildfile from '../contracts/StakingAuRaCoins.json';
// import Amount from './Amount';
// import { Pool } from './Pool';
// TODO: this is likely not working because of https://github.com/ethereum-ts/TypeChain/issues/187
// import * as TestAbi from '../abis/ValidatorSetAuRa.d';

// TODO: like this?
declare global {
  interface Window {
    ethereum: any;
  }
}

type Address = string;

// TODO: check this instead: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/call
declare global {
  interface String {
    print(): string; // in ATS units
    asNumber(): number; // in ATS units
  }
}

interface IAmount {
  fromWei(): number; // in ATS units
}

/*
type Amount = string & IAmount;

class AmountHelper extends String implements IAmount {
  public fromWei(this: Amount): number {
    const web3 = new Web3();

    return parseFloat(web3.utils.fromWei(this));
  }
  public static init(amount: string | number): Amount {
    return new AmountHelper(amount) as Amount;
  }
}

const a: Amount = AmountHelper.init('123');
a.fromWei();
 */

// TODO: can this be added to the Amount type only (instead of String) without complicating usage?
// eslint-disable-next-line no-extend-native
String.prototype.print = function (this: string) {
  return this.asNumber().toFixed(3);
};
// eslint-disable-next-line no-extend-native
String.prototype.asNumber = function (this: string) {
  const web3 = new Web3();
  return parseFloat(web3.utils.fromWei(this));
};
type Amount = string;

interface IDelegator {
  address: Address;
}

// TODO: should it be done this way?
/*
class Address extends String {
    constructor(addr: string) {
        // TODO: this is ugly. How to do better?
        const web3 = new Web3();
        if(! Web3.utils.isAddress(addr)) {
            throw TypeError('not a valid Ethereum address');
        }
        super(web3.utils.toChecksumAddress(addr));
    }
}
 */

// TODO: be consistent about type (string vs BN vs number) and unit (ATS vs wei) for amounts

// TODO: when is it worth it creating a class / dedicated file?
export interface IPool {
  readonly stakingAddress: Address;
  miningAddress: Address;
  isCurrentValidator: boolean;
  candidateStake: Amount;
  totalStake: Amount;
  myStake: Amount;
  delegators: Array<IDelegator>; // TODO: how to cast to Array<IDelegator> ?
  isMe: boolean;
}

export default class Context {
  @observable public currentBlockNumber = -1;

  @observable public myAddr: Address = '';

  // in Ether (not wei!)
  @observable public myBalance: Amount = '';

  public candidateMinStake: Amount = '';

  public delegatorMinStake: Amount = '';

  @observable public stakingEpoch = -1;

  // positive value: allowed for n more blocks
  // negative value: allowed in n blocks
  @observable public stakingAllowedTimeframe = 0;

  @observable public pools: IPool[] = [];

  @observable public currentValidators: Address[] = [];

  // TODO: properly implement singleton pattern
  // eslint-disable-next-line max-len
  public static async initialize(rpcUrl: URL, validatorSetContractAddress: Address): Promise<Context> {
    const ctx = new Context();
    ctx.web3WS = new Web3(rpcUrl.toString());

    // doc: https://metamask.github.io/metamask-docs/API_Reference/Ethereum_Provider
    if (!window.ethereum) {
      throw Error('no web3 injected');
    }

    ctx.web3 = new Web3(window.ethereum);
    ctx.myAddr = ctx.web3.utils.toChecksumAddress((await window.ethereum.enable())[0]);

    window.ethereum.on('accountsChanged', (accounts: any) => {
      alert(`metamask account changed to ${accounts}. You may want to reload...`);
    });

    window.ethereum.on('chainChanged', (chainId: any) => {
      alert(`metamask chain changed to ${chainId}. You may want to reload...`);
    });

    ctx.defaultTxOpts.from = ctx.myAddr;

    await ctx.initContracts(validatorSetContractAddress);

    return ctx;
  }

  // TODO: so, it's ok to have a getter method without the associated field declared? Or is that mobx specific?
  @computed get myPool(): IPool | undefined {
    return this.pools.filter((p) => p.stakingAddress === this.myAddr)[0];
  }

  @computed
  public get iHaveAPool(): boolean {
    return this.myPool !== undefined;
  }

  // returns true if staking/withdrawing etc. are currently allowed
  // TODO: find a better name
  public async checkCanStakeNow(): Promise<boolean> {
    const canStake = await this.stContract.methods.areStakeAndWithdrawAllowed().call();
    if (!canStake) {
      console.log('staking season currently closed');
      return false;
    }
    return true;
  }

  // creates a pool for the currently connected account (account address becomes staking address)
  // TODO: figure out return type and how to deal with asynchrony and errors
  public async createPool(miningKeyAddr: Address) {
    if (!await this.checkCanStakeNow()) {
      return;
    }

    const txOpts = this.defaultTxOpts;
    txOpts.value = this.candidateMinStake;

    try {
      // TODO: check if this works now, if so, use it
      const gasEst = await this.stContract.methods.addPool(0, miningKeyAddr).estimateGas(txOpts);
    } catch (e) {
      console.log(`estimating gas failed with ${e}`);
    }

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
  public async stake(poolAddr: Address, amount: number) {
    console.log(`${this.myAddr} wants to stake ${amount} ATS on pool ${poolAddr}`);

    if (!await this.checkCanStakeNow()) {
      return;
    }

    const txOpts = this.defaultTxOpts;
    txOpts.value = this.web3.utils.toWei(amount.toString());

    try {
      const gasEst = await this.stContract.methods.stake(poolAddr, 0).estimateGas(txOpts);
    } catch (e) {
      console.log(`estimating gas failed with ${e}`);
    }

    try {
      // amount is ignored
      const receipt = await this.stContract.methods.stake(poolAddr, 0).send(txOpts);
      // console.log(`receipt: ${JSON.stringify(receipt, null, 2)}`);
      console.log(`tx ${receipt.transactionHash} for stake(): block ${receipt.blockNumber}, ${receipt.gasUsed} gas`);
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
  private vsContract: any;

  private stContract: any;

  private stakingEpochEndBlock = -1;

  private stakeWithdrawDisallowPeriod = -1;

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
      this.vsContract = new this.web3.eth.Contract((ValidatorSetBuildfile.abi as any), validatorSetContractAddress);
      const stAddress = await this.vsContract.methods.stakingContract().call();
      this.stContract = new this.web3.eth.Contract((StakingBuildfile.abi as any), stAddress);
    } catch (e) {
      console.log(`initializing contracts failed: ${e}`);
      throw e;
    }

    this.candidateMinStake = await this.stContract.methods.candidateMinStake().call();
    this.delegatorMinStake = await this.stContract.methods.delegatorMinStake().call();
    // eslint-disable-next-line no-underscore-dangle
    console.log(`vs: ${this.vsContract._address}, st: ${this.stContract._address}, candidateMinStake: ${this.candidateMinStake}`);

    this.stakingEpoch = await this.stContract.methods.stakingEpoch().call();
    this.stakingEpochEndBlock = await this.stContract.methods.stakingEpochEndBlock().call();
    this.stakeWithdrawDisallowPeriod = await this.stContract.methods.stakeWithdrawDisallowPeriod().call();

    await this.subscribeToEvents(this.web3WS);

    this.syncPoolsState();
    // const testContract = new this.web3.eth.Contract(TestAbi, validatorSetContractAddress);
  }

  // (re-)builds the data structure this.pools based on the current state on chain
  // This may become overkill in a busy system. It should be possible to do more fine-grained updates instead.
  // But for a start, this does the job.
  private async syncPoolsState() {
    this.pools = [];
    const poolAddrs: Array<string> = await this.stContract.methods.getPools().call();
    console.log(`fetched ${poolAddrs.length} pool addresses. Iterating...`);
    poolAddrs.forEach(async (stakingAddress) => {
      console.log(`checking pool ${stakingAddress}`);
      const miningAddress = await this.vsContract.methods.miningByStakingAddress(stakingAddress).call();
      // TODO: does this return BN with typechain?
      const candidateStake: string = await this.stContract.methods.stakeAmount(stakingAddress, stakingAddress).call();
      const totalStake: string = await this.stContract.methods.stakeAmountTotal(stakingAddress).call();
      const myStake: string = await this.stContract.methods.stakeAmount(stakingAddress, this.myAddr).call();
      const delegatorAddrs: Array<string> = await this.stContract.methods.poolDelegators(stakingAddress).call();
      this.pools.push({
        miningAddress,
        isCurrentValidator: false,
        stakingAddress,
        candidateStake,
        totalStake,
        myStake,
        delegators: delegatorAddrs.map((da) => ({ address: da })),
        isMe: stakingAddress === this.myAddr,
      });
    });
  }

  private async updateCurrentValidators() {
    const newCurrentValidators = (await this.vsContract.methods.getValidators().call()).sort();
    // make sure both arrays were sorted beforehand
    if (this.currentValidators.toString() !== newCurrentValidators.toString()) {
      console.log(`validator set changed in block ${this.currentBlockNumber}`);
      this.currentValidators = newCurrentValidators;
      // update pools accordingly
      this.pools.forEach((p) => {
        p.isCurrentValidator = newCurrentValidators.indexOf(p.miningAddress) >= 0;
      });
    }
  }

  private async handleNewBlock(web3Instance: any, blockHeader: any): Promise<void> {
    this.currentBlockNumber = blockHeader.number;
    this.myBalance = await web3Instance.eth.getBalance(this.myAddr);

    if (this.currentBlockNumber > this.stakingEpochEndBlock) {
      console.log(`updating stakingEpochEndBlock at block ${this.currentBlockNumber}`);
      this.stakingEpochEndBlock = await this.stContract.methods.stakingEpochEndBlock().call();
      this.stakingEpoch = await this.stContract.methods.stakingEpoch().call();
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

    // TODO: don't do this in every block. There's no event we can rely on, but we can be smarter than this
    this.updateCurrentValidators();
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

    this.stContract.events.allEvents({}, async (error: any, event: any) => {
      if (error) {
        console.log(`event error: ${error}`);
      } else if (this.handledStEvents.has(event.blockNumber)) {
        console.log(`staking contract event for block ${event.blockNumber} already handled, ignoring`);
      } else {
        this.handledStEvents.add(event.blockNumber);
        console.log(`staking contract event ${event.event} originating from ${event.address} at block ${event.blockNumber}`);
        await this.syncPoolsState();
      }
    });

    // listen to InitiateChange events. Those signal Parity to switch validator set.
    // for logging purposes only at the moment
    // re-read pools on any contract event
    this.vsContract.events.InitiateChange({}, async (error: any, event: any) => {
      if (error) {
        console.log(`event error: ${error}`);
      } else {
        console.log(`validatorset contract event ${event.event} at block ${event.blockNumber}`);
        // TODO: if any handler is added here, make sure it's not triggered more than once per block
      }
    });
  }
}
