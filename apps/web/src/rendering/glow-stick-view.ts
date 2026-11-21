import { displayNameOf, glowStickColor, inspectGlowState, isGlowStickId, type ItemStack } from "@craft/engine";
import type { TextureAtlas } from "@craft/textures";
import { blockIcon } from "../ui/icons";

const colors: Readonly<Record<string, string>> = { red: "#ff5a50", green: "#78df62", brown: "#c99668", blue: "#698cff", purple: "#b783f5", cyan: "#50d9dc", gray: "#c6ced2", pink: "#ffa5cb", lime: "#b9ed59", yellow: "#ffe26b", light_blue: "#8bd8ff", magenta: "#f678e8", orange: "#ffad54", white: "#f7fbff" };

/** A selected-item view only: no inventory, timer or light ownership. */
export class GlowStickView {
  readonly root = document.createElement("div");
  private readonly icon = document.createElement("img");
  private readonly status = document.createElement("span");
  private last = "";

  constructor(container: HTMLElement, private readonly atlas: TextureAtlas) {
    this.root.className = "held-glow-stick"; this.root.hidden = true;
    this.root.setAttribute("aria-label", "Held glow stick"); this.root.setAttribute("role", "status");
    this.icon.draggable = false; this.icon.alt = ""; this.root.append(this.icon, this.status); container.appendChild(this.root);
  }

  update(stack: ItemStack | null, visible: boolean): void {
    this.root.hidden = !visible || !stack || !isGlowStickId(stack.id);
    if (this.root.hidden || !stack) return;
    const signature = JSON.stringify(stack); if (signature === this.last) return; this.last = signature;
    const state = inspectGlowState(stack), active = state.kind === "active";
    this.root.dataset.glowState = active ? "active" : "ready";
    this.root.style.setProperty("--glow-color", colors[glowStickColor(stack.id) ?? ""] ?? "#f7fbff");
    this.icon.src = blockIcon(this.atlas, stack.id);
    this.status.textContent = state.kind === "invalid" ? "Unavailable" : active ? "Glowing" : "Ready to shake";
    this.root.setAttribute("aria-label", `${displayNameOf(stack.id)}: ${this.status.textContent}`);
  }

  shake(): void { this.root.classList.remove("shake"); void this.root.offsetWidth; this.root.classList.add("shake"); }
  dispose(): void { this.root.remove(); }
}
