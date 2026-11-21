import { displayNameOf, inspectSparklerState, isSparklerId, SPARKLER_COLORS, sparklerColor, type ItemStack } from "@craft/engine";
import type { TextureAtlas } from "@craft/textures";
import { blockIcon } from "../ui/icons";

/** Two held views with at most eight cosmetic sparks each; they never own items or simulation RNG. */
export class SparklerView {
  readonly root = document.createElement("div");
  private readonly hands = [document.createElement("div"), document.createElement("div")];
  private readonly signatures = ["", ""];
  constructor(container: HTMLElement, private readonly atlas: TextureAtlas) {
    this.root.className = "held-sparklers"; this.root.hidden = true;
    this.hands.forEach((hand, i) => { hand.className = `held-sparkler ${i ? "offhand" : "mainhand"}`; hand.setAttribute("role", "status"); this.root.appendChild(hand); });
    container.appendChild(this.root);
  }
  update(selected: ItemStack | null, offhand: ItemStack | null, visible: boolean): void {
    const stacks = [selected, offhand]; let shown = false;
    this.hands.forEach((hand, index) => {
      const stack = stacks[index];
      hand.hidden = !visible || !stack || !isSparklerId(stack.id);
      if (hand.hidden || !stack) { hand.replaceChildren(); this.signatures[index] = ""; return; }
      shown = true;
      const signature = JSON.stringify(stack); if (signature === this.signatures[index]) return;
      this.signatures[index] = signature;
      const state = inspectSparklerState(stack), active = state.kind === "active";
      const color = SPARKLER_COLORS.find(row => row.color === sparklerColor(stack.id));
      hand.dataset.sparklerState = active ? "active" : "ready";
      hand.style.setProperty("--spark-color", color?.colorHex ?? "#ffce7a");
      const icon = document.createElement("img"); icon.src = blockIcon(this.atlas, stack.id, 64, stack); icon.alt = ""; icon.draggable = false;
      const status = document.createElement("span"); status.className = "sparkler-state";
      status.textContent = `${index ? "Offhand · " : ""}${active ? "Lit" : state.kind === "invalid" ? "Unavailable" : "Ready to light"}`;
      hand.setAttribute("aria-label", `${index ? "Offhand " : ""}${displayNameOf(stack.id)}: ${status.textContent}`);
      hand.replaceChildren(icon, status);
      if (active) for (let i = 0; i < 8; i++) {
        const spark = document.createElement("i"); spark.className = "sparkler-spark"; spark.setAttribute("aria-hidden", "true");
        const angle = i * Math.PI / 4;
        spark.style.setProperty("--spark-x", `${Math.cos(angle) * 26}px`); spark.style.setProperty("--spark-y", `${Math.sin(angle) * 22 - 10}px`);
        spark.style.setProperty("--spark-delay", `${i * -.09}s`); hand.appendChild(spark);
      }
    });
    this.root.hidden = !shown;
  }
  dispose(): void { this.hands.forEach(hand => hand.replaceChildren()); this.root.remove(); }
}
