import { fork, take, cancel, throttle, takeEvery, takeLatest } from 'redux-saga/effects';
import _ from 'lodash';

function* runTask (takerFunc, pattern, saga, ...args) {
    return yield fork(function* () {
        yield takerFunc(pattern, saga, ...args);
    });
}

function* listenToCancel(cancelPatterns, task, taker, pattern, saga, ...args) {
    while (true) {
        yield take(cancelPatterns);
        yield cancel(task);
        task = yield fork(runTask, taker, pattern, saga, ...args);
    }
}

function* takeWithCancel(isLatest = false, pattern, cancelPatterns = [], saga, ...args) {
    let taker = isLatest ? takeLatest : takeEvery;
    let task = yield fork(runTask, taker, pattern, saga, ...args);

    if (_.isString(cancelPatterns)) {
        cancelPatterns = [cancelPatterns];
    }

    if (_.isArray(cancelPatterns) && cancelPatterns.length > 0) {
        yield fork(listenToCancel, cancelPatterns, task, taker, pattern, saga, ...args);
    }
}

const generateWatcher = (sagaParams, actionType, defs) => function* () {
    if (_.isFunction(defs)) {
        yield takeEvery(actionType, defs(sagaParams));
    } else if (_.isFunction(defs.handler)) {
        const handler = defs.noParams ? defs.handler : defs.handler(sagaParams);
        if (defs.throttle) {
            let throttleMs = _.isNumber(defs.throttle) ? defs.throttle : 100;
            yield throttle(throttleMs, actionType, handler);
        } else {
            let cancelOn = defs.cancelOn || [];
            yield* takeWithCancel(!!defs.takeLatest, actionType, cancelOn, handler);
        }
    }
};

function generateConfFromSaga (saga) {
    const config = {};

    for (let handler in saga) {
        if (handler.handle) {
            const type = handler.handle;

            config[type] = {
                handler,
                takeLatest: handler.takeLatest,
                throttle: handler.throttle,
                cancelOn: handler.cancelOn
            };
        }
    }

    return config;
}

// ============================================================================
// DEFAULT SAGA EXPORT
// ============================================================================

export function sagaCreator(sagaConfig) {
    let config = sagaConfig;

    if (config instanceof Saga) {
        config = generateConfFromSaga(config);
    }

    return function* (sagaParams) {
        let forks = [];

        _.forEach(config, (defs, actionType) => {
            forks.push(fork(generateWatcher(sagaParams, actionType, defs)));
        });

        yield forks;
    };
}

export class Saga {}
