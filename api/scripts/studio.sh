#!/bin/sh
# Lance Prisma Studio et l'expose hors du conteneur (make prisma-studio).
# Studio n'écoute que sur 127.0.0.1 : un petit relais Node écoute sur toutes les interfaces (port 5555, publié par
# compose.yaml) et transmet au port interne 5557. BROWSER=none : pas de navigateur à ouvrir dans un conteneur.
set -e
BROWSER=none npx prisma studio --port 5557 &
exec node -e '
const net = require("net");
net.createServer((client) => {
  const upstream = net.connect(5557, "127.0.0.1");
  client.pipe(upstream).pipe(client);
  client.on("error", () => upstream.destroy());
  upstream.on("error", () => client.destroy());
}).listen(5555, "0.0.0.0", () => console.log("Prisma Studio : http://localhost:" + (process.env.PRISMA_PORT || 5555)));
'
