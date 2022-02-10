import http from "http";
import rest from "./rest"

const handler = rest();



const server = http.createServer(handler);
server.listen(3000);
