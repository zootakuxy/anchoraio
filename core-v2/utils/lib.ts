export module lib {
    export const typeParser = {
        isInt ( any ){ return Number.isSafeInteger( Number( any ) ) },
        isNumber ( any ){ return !Number.isNaN( Number( any )) && Number.isFinite( Number( any ) )  },
        asInt( any ){ return typeParser.isInt( any )? Number( any ): undefined; },
        toInt( any ){ return this.asInt( Math.trunc( Number( any ) ))},
        asNumber( any ){ return typeParser.isNumber( any )? Number( any ): undefined; },
        asString( any ){ return any?.toString?.() },
        asStringArray( any ){
            if( !Array.isArray( any ) ) any = [ any ];
            return (any as string[]).map( value => {
                return value?.toString?.()
            });
        }
    } as const ;

    export function proxyOfArray<T>():{[p:string]:T[]}{
        return new Proxy({}, {
            get(target: {}, p: string | symbol, receiver: any): any {
                if( !target[p] ) target[ p ] = [];
                return target[ p ];
            }
        })
    }
}