import React, { ReactNode } from 'react';
import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import Context, { IPool } from '../model/Context';

export interface PoolViewProps {
  context: Context;
  pool: IPool;
}

@observer
export default class PoolView extends React.Component<PoolViewProps, {}> {
  @observable private stakeAmountStr = '';
  @observable private processing = false;

  @action.bound
  private handleStakeAmount(e: any) {
    const inputStr = e.currentTarget.value;
    const parsed = parseInt(inputStr);
    this.stakeAmountStr = Number.isNaN(parsed) ? '' : parsed.toString();
    console.log(`new stakeAmount: ${this.stakeAmountStr}`);
  }

  @action.bound
  private async handleStakeButton() {
    this.processing = true;
    const { context, pool } = this.props;
    const stakeAmount = parseInt(this.stakeAmountStr);
    if (Number.isNaN(stakeAmount)) {
      alert('no amount entered');
    } else if (stakeAmount > context.myBalance.asNumber()) {
      alert(`insufficient balance (${context.myBalance.print()} for selected amount ${stakeAmount}`);
    } else if (!await context.checkCanStakeNow()) {
      alert('outside staking window');
    } else if (pool.candidateStake < context.candidateMinStake) {
      alert('candidate hasn\'t staked themselves enough');
    } else if (stakeAmount < context.delegatorMinStake.asNumber()) {
      alert(`min staking amount is ${context.delegatorMinStake.print()}`);
    } else {
      await context.stake(pool.stakingAddress, stakeAmount);
      this.stakeAmountStr = '';
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
        <td>{pool.candidateStake.asNumber()}</td>
        <td>{pool.totalStake.fromWei()}</td>
        <td className="text-primary">{pool.myStake.asNumber()}</td>
        <td>{pool.delegators.length}</td>
        <td>
          <input
            type="text"
            placeholder="amount"
            value={this.stakeAmountStr}
            onChange={this.handleStakeAmount}
          />
          <button type="button" disabled={this.processing} onClick={this.handleStakeButton}>Stake</button>
        </td>
      </tr>
    );
  }
}
