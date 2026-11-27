import IComponent from "./IComponent.ts";

// Computes a sinusoidal offset over time. The entity decides on which axis to apply it.
export default class SineMovement implements IComponent {
    public enabled: boolean = true;

    private readonly _amplitude: number;
    private readonly _frequency: number;
    private _elapsed: number = 0;
    private _offset: number = 0;

    public get offset(): number {
        return this._offset;
    }

    public constructor(amplitude: number, frequency: number) {
        this._amplitude = amplitude;
        this._frequency = frequency;
    }

    public reset() {
        this._elapsed = 0;
        this._offset = 0;
    }

    public update(deltaTime: number) {
        if (!this.enabled)
            return;

        this._elapsed += deltaTime;
        // Elapsed time is in ms, frequency in Hz
        this._offset = this._amplitude * Math.sin(Phaser.Math.PI2 * this._frequency * this._elapsed / 1000);
    }
}
