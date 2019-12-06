import React, { ReactNode } from 'react';
import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import Context, { IPool } from '../model/Context';

export interface PoolViewProps {
  context: Context;
  pool: IPool;
}

@observer
export default class PoolView extends React.Component<PoolViewProps, {}> {
  @observable private amountStr = '';
  @observable private processing = false;

  // TODO: this isn't updated when the state of checkCanStakeOrWithdrawNow() changes
  @computed
  private get buttonsEnabled(): boolean {
    const { context } = this.props;
    return context.canStakeOrWithdrawNow && !this.processing;
  }

  @action.bound
  private handleAmount(e: React.ChangeEvent<HTMLInputElement>): void {
    const inputStr = e.currentTarget.value;
    const parsed = parseInt(inputStr);
    this.amountStr = Number.isNaN(parsed) ? '' : parsed.toString();
  }

  @action.bound
  private async handleStakeButton(): Promise<void> {
    this.processing = true;
    const { context, pool } = this.props;
    const stakeAmount = parseInt(this.amountStr);
    const minStake = pool === context.myPool ? context.candidateMinStake : context.delegatorMinStake;
    if (Number.isNaN(stakeAmount)) {
      alert('no amount entered');
    } else if (stakeAmount > context.myBalance.asNumber()) {
      alert(`insufficient balance (${context.myBalance.print()}) for selected amount ${stakeAmount}`);
    } else if (!context.canStakeOrWithdrawNow) {
      alert('outside staking/withdraw time window');
    } else if (pool !== context.myPool && pool.candidateStake < context.candidateMinStake) {
      // TODO: this condition should be checked before even enabling the button
      alert('insufficient candidate (pool owner) stake');
    } else if (stakeAmount < minStake.asNumber()) {
      alert(`min staking amount is ${minStake.print()}`);
    } else {
      await context.stake(pool.stakingAddress, stakeAmount);
      this.amountStr = '';
    }
    this.processing = false;
  }

  // TODO: refactor to reduce duplicate code
  @action.bound
  private async handleWithdrawButton(): Promise<void> {
    this.processing = true;
    const { context, pool } = this.props;
    const withdrawAmount = parseInt(this.amountStr);
    if (Number.isNaN(withdrawAmount)) {
      alert('no amount entered');
    } else if (!context.canStakeOrWithdrawNow) {
      alert('outside staking/withdraw time window');
    } else if (withdrawAmount > pool.myStake.asNumber()) {
      alert('cannot withdraw as much');
    } else {
      const needsClaimTx = await context.withdraw(pool.stakingAddress, withdrawAmount);
      if (needsClaimTx) {
        alert('The withdrawn amount could not immediately be transferred to your account, because the pool is in the current or next validator set.\n'
          + 'You need to wait for the next staking epoch and then click the then appearing "Claim" button in order to initiate the transfer!');
      }
      this.amountStr = '';
    }
    this.processing = false;
  }

  @action.bound
  private async handleClaimButton(): Promise<void> {
    this.processing = true;
    const { context, pool } = this.props;
    if (!context.canStakeOrWithdrawNow) {
      alert('outside staking/withdraw time window');
    } else {
      await context.claim(pool.stakingAddress);
    }
    this.processing = false;
  }

  public render(): ReactNode {
    const { pool } = this.props;
    // TODO: find better classes for switching color
    const stakingAddressClass = pool.isMe ? 'text-primary' : '';
    const miningAddressClass = pool.isCurrentValidator ? 'text-success' : '';
    return (
      <tr>
        <td className={stakingAddressClass}>{pool.stakingAddress}</td>
        <td className={miningAddressClass}>{pool.miningAddress}</td>
        <td>{pool.delegators.length}</td>
        <td>{pool.candidateStake.asNumber()}</td>
        <td>{pool.totalStake.asNumber()}</td>
        <td className={`${pool.myStake.asNumber() > 0 ? 'text-primary' : ''}`}>{pool.myStake.asNumber()}</td>
        <td className={`${pool.claimable.canClaimNow() ? 'text-primary' : 'text-secondary'}`}>{pool.claimable.amount.asNumber()}</td>
        <td>
          <input
            type="text"
            placeholder="amount"
            value={this.amountStr}
            onChange={this.handleAmount}
          />
          <br />
          <div className="spinner-border" hidden={!this.processing} role="status">
            <span className="sr-only">Loading...</span>
          </div>
          <button type="button" disabled={!this.buttonsEnabled} onClick={this.handleStakeButton}>Stake</button>
          <button type="button" disabled={!this.buttonsEnabled} onClick={this.handleWithdrawButton} hidden={pool.myStake.asNumber() === 0}>Withdraw</button>
          <button type="button" disabled={!this.buttonsEnabled} onClick={this.handleClaimButton} hidden={!pool.claimable.canClaimNow()}>Claim</button>
        </td>
      </tr>
    );
  }
}
