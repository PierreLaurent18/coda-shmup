import Entity from "./Entity.ts";
import type {PowerUpData, PowerUpType} from "../gameData/PowerUpsData.ts";

// Bonus dropped by enemies: it falls down the screen until the player catches it
export default class PowerUp extends Entity {
    private static readonly SCALE: number = 2;
    private static readonly PULSE_SCALE: number = 2.5;
    private static readonly PULSE_DURATION: number = 400;
    // deg/ms
    private static readonly SPIN_SPEED: number = 0.1;

    private _powerUpType: PowerUpType;
    private _fallSpeed: number = 0;
    private _pulseTween: Phaser.Tweens.Tween | undefined;

    public get powerUpType(): PowerUpType {
        return this._powerUpType;
    }

    public enable(x: number, y: number, type: PowerUpType, data: PowerUpData, fallSpeed: number) {
        this._powerUpType = type;
        this._fallSpeed = fallSpeed;

        this.enableBody(true, x, y, true, true);
        this.setFrame(data.frame);
        this.setTint(Phaser.Display.Color.HexStringToColor(data.tint).color);
        this.setScale(PowerUp.SCALE);
        // Radius in texture pixels: the body applies the sprite scale itself
        this.arcadeBody.setCircle(this.width / 2);

        this._pulseTween = this.scene.tweens.add({
            targets: this,
            scale: PowerUp.PULSE_SCALE,
            yoyo: true,
            repeat: -1,
            duration: PowerUp.PULSE_DURATION
        });
    }

    public disable() {
        this._pulseTween?.remove();
        this._pulseTween = undefined;

        this.disableBody(true, true);
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        // Recycle once it has left the screen at the bottom
        if (this.y > this.scene.cameras.main.height + this.displayHeight) {
            this.disable();
            return;
        }

        this.y += this._fallSpeed * deltaTime;
        this.angle += PowerUp.SPIN_SPEED * deltaTime;
    }
}
