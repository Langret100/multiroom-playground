import fs from "node:fs";

for (const file of ["index.html", "room.html"]) {
  const source = fs.readFileSync(file, "utf8");
  const ids = [...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) throw new Error(`${file}: duplicate IDs: ${duplicates.join(", ")}`);

  const required = file === "index.html"
    ? ["roomsBody", "openCreate", "openCreate2", "refreshRooms", "chatInput", "chatSend", "usersWrap"]
    : ["playersList", "readyBtn", "startBtn", "roomChatInput", "roomChatSend", "leaveBtn", "gameBriefingBoard", "briefingModeBadge", "briefingFlow", "briefingControls", "briefingTip"];
  for (const id of required) {
    if (!ids.includes(id)) throw new Error(`${file}: missing required UI hook #${id}`);
  }
  console.log(`PASS ${file}: ${ids.length} unique IDs and all required hooks present`);
}

const css = fs.readFileSync("css/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
let balance = 0;
for (const char of css) {
  if (char === "{") balance += 1;
  if (char === "}") balance -= 1;
  if (balance < 0) throw new Error("styles.css: closing brace without an opening brace");
}
if (balance !== 0) throw new Error(`styles.css: brace balance is ${balance}`);

for (const selector of [
  ".lobbySectionHead",
  "body.page-lobby tbody .roomRow",
  "body.page-room:not(.in-game) .playersPanel > .controls",
  "body.page-room:not(.in-game) .roomActionBtn",
  ".gameBriefingBoard",
  ".briefingCards",
]) {
  if (!css.includes(selector)) throw new Error(`styles.css: missing layout rule ${selector}`);
}
console.log("PASS styles.css: balanced and responsive lobby/room rules present");
