// TODO: should this be .ts or .tsx ?

import Web3 from 'web3';
import * as ValidatorSetBuildfile from '../contracts/ValidatorSetAuRa.json';
import * as StakingBuildfile from '../contracts/StakingAuRaCoins.json';
//import { Pool } from './Pool';
import {observable} from "mobx";
// TODO: why can't I import this?
//import * as TestAbi from '../abis/ValidatorSetAuRa';

// TODO: like this?
declare global {
    interface Window { ethereum: any; }
}

interface IDelegator {
    address: string;
}

// TODO: when is it worth it creating a class / dedicated file?
export interface IPool {
    miningAddress: string;
    stakingAddress: string;
    stake: number; // TODO: use BN instead (?)
    delegators: Array<string>; // TODO: how to cast to Array<IDelegator> ?
}

export default class Context {
    // @ts-ignore
    // TODO: how to init?
    public web3: Web3;
    public vsContract: any;
    public stContract: any;
    @observable public currentBlockNumber: number = 0;
    // TODO: how to type members which may remain unset?
    private account: any;
    public candidateMinStake: any;

    // TODO: if I make this observable, how can I query it in console?
    public pools: Array<IPool> = [];

    // TODO: initialization may not have finished when this returns
    constructor(rpcUrl: URL, validatorSetContractAddress: string, privKey?: string) {
        this.web3 = new Web3(rpcUrl.toString());
        this.account = privKey ? this.web3.eth.accounts.privateKeyToAccount(privKey) : null;

        this.initContracts(validatorSetContractAddress);
    }

    private async initContracts(validatorSetContractAddress: string) {
/*
        // https://medium.com/metamask/https-medium-com-metamask-breaking-change-injecting-web3-7722797916a8
        if(! window.ethereum) {
            throw('no web3 injected');
        }

        this.web3 = new Web3(window.ethereum);
        const accounts = window.ethereum.enable();
 */

        // @ts-ignore
        // TODO: if a contract call fails, the stack trace doesn't show the actual line number.
        this.vsContract = new this.web3.eth.Contract(ValidatorSetBuildfile.abi, validatorSetContractAddress);
        const stAddress = await this.vsContract.methods.stakingContract().call();
        // @ts-ignore
        this.stContract = new this.web3.eth.Contract(StakingBuildfile.abi, stAddress);

        this.candidateMinStake = await this.stContract.methods.candidateMinStake().call();
        console.log(`vs: ${this.vsContract._address}, st: ${this.stContract._address}, candidateMinStake: ${this.candidateMinStake}`);

        await this.subscribeToNewBlocks();

        this.getPools();
        //const testContract = new this.web3.eth.Contract(TestAbi, validatorSetContractAddress);
    }

    public async getPools() {
        const poolAddrs: Array<string> = await this.stContract.methods.getPools().call();
        poolAddrs.forEach(async stakingAddr => {
            console.log(`checking pool ${stakingAddr}`);
            const miningAddr = await this.vsContract.methods.miningByStakingAddress(stakingAddr).call();
            // TODO: does this return BN with typechain?
            const totalStake = await this.stContract.methods.stakeAmountTotal(stakingAddr).call();
            const delegatorAddrs: Array<string> = await this.stContract.methods.poolDelegators(stakingAddr).call();
            this.pools.push({
                miningAddress: miningAddr,
                stakingAddress: stakingAddr,
                stake: totalStake, // TODO: why doesn't it complain about setting a string here?
                delegators: delegatorAddrs
           })
        });
    }

    public async addPool() {
        //ctx.stContract.methods.addPool(0, "0xf67cc5231c5858ad6cc87b105217426e17b824bb").estimateGas()
        const txObj = {
            from: this.account.address,
            gas: 1000000,
            value: this.candidateMinStake,
            data: this.stContract.methods.addPool(0, this.account.address).encodeABI()
        };

        console.log(`txObj: ${JSON.stringify(txObj, null, 2)}`);
    }

    // keeps the state in sync
    private async subscribeToNewBlocks(): Promise<void> {
        this.currentBlockNumber = await this.web3.eth.getBlockNumber();
        // @ts-ignore
        this.web3.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
            if (error) {
                console.error(error);
                return;
            }
            this.currentBlockNumber = blockHeader.number;
        });

        // TODO: update posdao state too. What's the most efficient way to achieve this? Is here the right context?
    }
}
