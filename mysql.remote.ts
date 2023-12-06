import net from "net";

let server = net.createServer( socket => {
    console.log("New connection received!" );
    let connection = net.connect({
        host: "127.0.0.1",
        port: 3306
    }, () => {
        console.log( "Connection with server stabelished!" );
        socket.on( "data", data => {
            connection.write( data );
        });
        connection.on( "data", data => {
            socket.write( data );
        })
    });
});

server.listen( 3322 );