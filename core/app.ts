export function appLabel( ...path:string[] ){
    let _path = path.join( ">" );
    if( _path.length ) _path = ` ${path} >`
    return `[ANCHORIO]${ _path }`;
}