import React, { ReactNode } from 'react';
import Context, { IPool } from '../model/Context';

export interface PoolViewProps {
    context: Context;
    pool: IPool;
}

export default class PoolView extends React.Component<PoolViewProps, {}> {
    public render(): ReactNode {
        const { context, pool } = this.props;
        return (
            // TODO: what kinf of HTML constract to use here?
            <div id={pool.stakingAddress}>
                <p>
                    staking address: {pool.stakingAddress},
                    mining address: {pool.miningAddress},
                    total stake: {pool.stake},
                    nr delegators: {pool.delegators.length}
                </p>
            </div>
        );
    }
}
