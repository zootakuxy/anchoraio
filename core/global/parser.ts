
export const typeParser = {
    isInt ( any ){ return Number.isSafeInteger( Number( any ) ) },
    asInt( any ){ return typeParser.isInt( any )? Number( any ): undefined; },
    asString( any ){ return any?.toString?.() },
    asStringArray( any ){
        if( !Array.isArray( any ) ) any = [ any ];
        return (any as string[]).map( value => {
            return value?.toString?.()
        });
    }
} as const ;