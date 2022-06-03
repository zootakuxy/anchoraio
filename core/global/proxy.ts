export function proxyOfArray<T>():{[p:string]:T[]}{
    return new Proxy({}, {
        get(target: {}, p: string | symbol, receiver: any): any {
            if( !target[p] ) target[ p ] = [];
            return target[ p ];
        }
    })
}