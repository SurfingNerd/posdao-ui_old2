import { observer } from 'mobx-react';
import React from 'react';
import Model from './model/Model';
import Context from './model/Context';
import logo from './logo.svg';
import './App.css';
import PoolView from "./components/PoolView";

interface AppProps {
  model?: Model;
  context: Context;
}

@observer
class App extends React.Component<AppProps, {}> {
  public render(): JSX.Element {
    const { context } = this.props;
    const poolList = context.pools.map(pool => (
        // TODO: should the key prop be here or inside the view?
        <PoolView context={context} pool={pool} key={pool.stakingAddress}/>
    ));

    return (
      <div className="App">
        // TODO: css template/framework / convention to have a decent layout without writing CSS
        <header className="App-header">
          <p>
            Current block nr: { context.currentBlockNumber }
          </p>
        </header>
        <div id="poolList">
          {poolList}
        </div>
      </div>
    );
  }
}

export default App;
