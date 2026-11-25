import "./style.css";
import { bootTactical2DGame } from "./kernel/tactical2dStage";

const host = document.getElementById("stage");
if (host) {
  bootTactical2DGame(host);
}
