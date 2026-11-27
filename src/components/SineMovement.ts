import IComponent from "./IComponent.ts";

// Computes a sinusoidal offset over time. The entity decides on which axis to apply it.
export default class SineMovement implements IComponent {
    public enabled: boolean = true;

    private readonly _amplitude: number;
    private readonly _frequency: number;
    private _elapsed: number = 0;
    private _offset: number = 0;
    private _previousOffset: number = 0;

    public get offset(): number {
        return this._offset;
    }

    // How much the offset changed during the last update
    public get offsetDelta(): number {
        return this._offset - this._previousOffset;
    }

    public constructor(amplitude: number, frequency: number) {
        this._amplitude = amplitude;
        this._frequency = frequency;
    }

    public reset() {
        this._elapsed = 0;
        this._offset = 0;
        this._previousOffset = 0;
    }

    public update(deltaTime: number) {
        this._previousOffset = this._offset;

        if (!this.enabled)
            return;

        this._elapsed += deltaTime;
        // Elapsed time is in ms, frequency in Hz
        this._offset = this._amplitude * Math.sin(Phaser.Math.PI2 * this._frequency * this._elapsed / 1000);
    }
}
