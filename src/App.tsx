import { observer } from 'mobx-react';
import React from 'react';
import Context from './model/Context';
import './App.css';
import PoolView from "./components/PoolView";
import {action, computed} from "mobx";

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
        if (! await context.checkCanStakeNow()) {
            alert(`outside staking window`);
        }
        await context.createPool(this.miningKeyAddr);
        this.processing = false;
    }

    @computed
    get stakingWindowState(): string {
        return this.props.context.stakingAllowedTimeframe > 0 ? "open" : "closed";
    }

    // TODO: should the key prop be here or inside the view?
  public render(): JSX.Element {
    const { context } = this.props;
    const poolList = context.pools.map(pool => (
        <PoolView context={context} pool={pool} key={pool.stakingAddress}/>
    ));

      // TODO: css template/framework / convention to have a decent layout without writing CSS
    return (
      <div className="App">
        <header>
          <p>
            account: <span className="text-primary">{context.myAddr}</span> | balance: {context.myBalance.print()} ATS<br/>
            current block nr: { context.currentBlockNumber } | current epoch: { context.stakingEpoch } | staking window {this.stakingWindowState}: { context.stakingAllowedTimeframe } blocks
          </p>
        </header>
        <div className="container" id="poolList">
            <table className="table table-bordered">
                <thead>
                <tr><th>staking address</th><th>mining address</th><th>candidate stake</th><th>total stake</th><th>my stake</th><th>nr delegators</th><th>actions</th></tr>
                </thead>
                <tbody>
                    {poolList}
                </tbody>
            </table>
        </div>
          <div id="addPool" hidden={context.iHaveAPool}>
              <input type="text" placeholder="mining key" onChange={(e) => this.miningKeyAddr = e.currentTarget.value}/>
              <button disabled={this.processing} onClick={this.handleAddPool}>Add Pool</button>
          </div>
          <div id="removePool" hidden={! context.iHaveAPool}>
              <button disabled={this.processing}>Remove My Pool (TODO)</button>
          </div>
      </div>
    );
  }
}

export default App;
