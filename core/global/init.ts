(()=>{
    require( "source-map-support" ).install();
    process.on( "uncaughtExceptionMonitor", error => {
        // console.error(error.message)
    });
    process.on( "uncaughtException", error => {
        // console.error(error.message)
    });
    process.on( "unhandledRejection", error => {
        // console.error(error)
    });
    console.log("[ANCHORIO] Init> OK!");
})();
