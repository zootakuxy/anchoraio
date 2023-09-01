import {SERVER_REQUEST_PORT, SERVER_RESPONSE_PORT} from "./PORTS";

require("source-map-support").install();

import {server} from "./src/server-io-v2";


server({
    requestPort: SERVER_REQUEST_PORT,
    responsePort: SERVER_RESPONSE_PORT
});
