import { observer } from 'mobx-react';
import React from 'react';
import { action, computed } from 'mobx';
import Context from './model/Context';
import './App.css';
import PoolView from './components/PoolView';

interface AppProps {
  context: Context;
}

@observer
class App extends React.Component<AppProps, {}> {
  private miningKeyAddr = '';
  private processing = false;

  @action.bound
  private async handleAddPool() {
    this.processing = true;
    const { context } = this.props;
    if (!context.canStakeOrWithdrawNow) {
      alert('outside staking window');
    }
    await context.createPool(this.miningKeyAddr);
    this.processing = false;
  }

  @computed
  get isStakingAllowed(): boolean {
    const { context } = this.props;
    return context.stakingAllowedTimeframe > 0 && context.canStakeOrWithdrawNow;
  }

  @computed
  get stakingAllowedState(): string {
    return this.isStakingAllowed ? 'allowed' : 'NOT allowed';
  }

  // TODO: should the key prop be here or inside the view?
  public render(): JSX.Element {
    const { context } = this.props;
    const poolList = context.pools.map((pool) => (
      <PoolView context={context} pool={pool} key={pool.stakingAddress} />
    ));

    // TODO: css template/framework / convention to have a decent layout without writing CSS
    return (
      <div className="App">
        <header>
          <p>
            account: <span className="text-primary">{context.myAddr}</span> |
            balance: {context.myBalance.print()} ATS<br />

            current block nr: {context.currentBlockNumber} | current epoch: {context.stakingEpoch} |
            <span className={`${this.isStakingAllowed ? 'text-success' : 'text-danger'}`}> staking {this.stakingAllowedState}: {context.stakingAllowedTimeframe} blocks</span>
          </p>
        </header>
        <div id="poolList">
          <table className="table table-bordered">
            <thead>
              <tr>
                <th>pool address</th>
                {/* <th>mining address</th> */}
                <th>validator stake share / reward share % in current epoch</th>
                <th>nr delegators</th>
                <th>candidate stake</th>
                <th>total stake</th>
                <th>my stake</th>
                <th>claimable</th>
                <th>staking actions</th>
                <th>uncollected reward</th>
                <th>reward actions</th>
              </tr>
            </thead>
            <tbody>
              {poolList}
            </tbody>
          </table>
        </div>
        <div id="addPool" hidden={context.iHaveAPool}>
          <input type="text" placeholder="mining key" onChange={(e) => (this.miningKeyAddr = e.currentTarget.value)} />
          <button type="button" disabled={this.processing} onClick={this.handleAddPool}>Add Pool</button>
        </div>
        <div id="removePool" hidden={!context.iHaveAPool}>
          <button type="button" disabled={this.processing}>Remove My Pool (TODO)</button>
        </div>
      </div>
    );
  }
}

export default App;
