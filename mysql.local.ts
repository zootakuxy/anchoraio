import net from "net";

let server = net.createServer( socket => {
    console.log("New connection received!" );
    let icount = 0;
    let connection = net.connect({
        host: "mysql.brainsoftstp.com",
        port: 3322
    }, () => {
        console.log( "Connection with server stabelished!" );
        socket.on( "data", data => {
            console.log( "client", icount++  );
            connection.write( data );
        });
        connection.on( "data", data => {
            console.log( "server", icount++);
            socket.write( data );
        })
    });
});

server.listen( 3306 );