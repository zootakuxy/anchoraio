(()=>{
    require( "source-map-support" ).install();
    process.on( "uncaughtExceptionMonitor", error => console.error( error ));
    process.on( "uncaughtException", error => console.error( error ));
    process.on( "unhandledRejection", error => console.error( error ));
    console.log("[ANCHORAIO] Init> OK!");
})();
