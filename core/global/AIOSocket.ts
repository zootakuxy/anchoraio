import net from "net";

export interface AIOSocket extends net.Socket {
    id:string,
    connected:boolean
}

export function asAIOSocket(socket:net.Socket, id ):AIOSocket {
    let _status = {
        connected: true
    };

    socket.on( "close", hadError => _status.connected = false );
    return Object.assign(socket, {
        id,
        get connected() {
            return _status.connected
        }
    }) as AIOSocket;
}
