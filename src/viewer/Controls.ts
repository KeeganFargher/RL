export class Controls {
  private readonly slider: HTMLInputElement;
  private readonly label: HTMLElement;
  private readonly onChange: (generationIndex: number) => void;

  constructor(slider: HTMLInputElement, label: HTMLElement, onChange: (generationIndex: number) => void) {
    this.slider = slider;
    this.label = label;
    this.onChange = onChange;
  }

  attach() {
    this.slider.addEventListener("input", () => {
      const idx = Number(this.slider.value);
      this.label.textContent = this.slider.value;
      this.onChange(idx);
    });
  }

  setMax(max: number) {
    this.slider.max = String(Math.max(0, max));
  }

  setValue(value: number) {
    this.slider.value = String(value);
    this.label.textContent = this.slider.value;
  }
}
