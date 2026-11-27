import IComponent from "./IComponent.ts";
import Entity from "../entities/Entity.ts";
import type {LaserData} from "../gameData/AbilitiesData.ts";

// Charged shot: charge() while the key is held, release() to fire a beam.
// The beam only emits FIRE_EVENT: who gets hit is decided by whoever listens (the EntityManager)
export default class LaserWeapon extends Phaser.Events.EventEmitter implements IComponent {
    public static readonly CHARGE_CHANGE_EVENT: string = 'chargeChange';
    public static readonly FIRE_EVENT: string = 'fire';

    private static readonly BEAM_DEPTH: number = 50;
    private static readonly SOUND_KEY: string = 'sfx_laser1';
    // Lower pitch than the regular shot
    private static readonly SOUND_RATE: number = 0.4;

    public enabled: boolean = true;

    private readonly _data: LaserData;
    private readonly _color: number;
    private _charge: number = 0;

    // 0 (empty) to 1 (full)
    public get charge(): number {
        return this._charge;
    }

    public constructor(data: LaserData) {
        super();

        this._data = data;
        this._color = Phaser.Display.Color.HexStringToColor(data.color).color;
    }

    public addCharge(deltaTime: number) {
        if (!this.enabled || this._charge >= 1)
            return;

        this.setCharge(Math.min(1, this._charge + deltaTime / this._data.chargeTime));
    }

    // Fires if charged enough, then empties the charge either way
    public release(source: Entity, direction: Phaser.Math.Vector2) {
        if (this.enabled && this._charge >= this._data.minCharge)
            this.fire(source, direction);

        this.setCharge(0);
    }

    private setCharge(value: number) {
        if (value === this._charge)
            return;

        this._charge = value;
        this.emit(LaserWeapon.CHARGE_CHANGE_EVENT, this._charge);
    }

    private fire(source: Entity, direction: Phaser.Math.Vector2) {
        const width: number = Phaser.Math.Linear(this._data.minWidth, this._data.maxWidth, this._charge);
        const damage: number = Math.max(1, Math.round(this._data.maxDamage * this._charge));

        const startX: number = source.x + direction.x * source.arcadeBody.radius;
        const startY: number = source.y + direction.y * source.arcadeBody.radius;
        const beam = new Phaser.Geom.Line(startX, startY,
            startX + direction.x * this._data.length, startY + direction.y * this._data.length);

        this.showBeam(source.scene, beam, width);
        source.scene.sound.play(LaserWeapon.SOUND_KEY, {rate: LaserWeapon.SOUND_RATE});

        this.emit(LaserWeapon.FIRE_EVENT, beam, width, damage);
    }

    private showBeam(scene: Phaser.Scene, beam: Phaser.Geom.Line, width: number) {
        const center = Phaser.Geom.Line.GetMidPoint(beam);
        const visual = scene.add.rectangle(center.x, center.y, Phaser.Geom.Line.Length(beam), width, this._color)
            .setRotation(Phaser.Geom.Line.Angle(beam))
            .setDepth(LaserWeapon.BEAM_DEPTH);

        scene.tweens.add({
            targets: visual,
            scaleY: 0,
            alpha: 0,
            ease: 'Quad.easeIn',
            duration: this._data.duration,
            onComplete: () => visual.destroy()
        });
    }
}
