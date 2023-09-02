let extension = "resolve.conf";
let resolveRegexp = RegExp( `((^)*.${extension})$|((^)${extension})$` )

// let extension = "resolve.conf";
// let resolveRegexp = /(\*\.resolve\.conf$|resolve\.conf$)/


console.log( resolveRegexp.test("\\resolve\\\\zootakuxy.resolve.conf.sample")) //False
console.log( resolveRegexp.test("\\resolve\\\\zootakuxy.resolve.conf")) //Verdadeiro