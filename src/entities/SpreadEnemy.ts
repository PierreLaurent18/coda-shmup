import type {SpreadEnemyData} from "../gameData/EnemiesData.ts";
import type {BulletData} from "../gameData/BulletData.ts";
import Entity from "./Entity.ts";
import Health from "../components/Health.ts";
import SineMovement from "../components/SineMovement.ts";
import SpreadWeapon from "../components/SpreadWeapon.ts";

// Base of the enemies configured from enemies.json: sine movement + spread shot.
// Children only decide how the sine offset moves them (see move()).
export default abstract class SpreadEnemy extends Entity {
    private static readonly HIT_FLASH_DURATION: number = 50;
    private static readonly HIT_FLASH_COLOR: number = 0xffffff;
    private static readonly HIT_SLOWDOWN_FACTOR: number = 0.5;
    private static readonly SHOOT_SOUND_KEY: string = 'sfx_laser2';

    protected _data: SpreadEnemyData;
    protected _target: Entity;
    private _tintColor: number;
    private _isHitFlashing: boolean = false;
    private _shootTimerConfig: Phaser.Types.Time.TimerEventConfig;
    private _shootTimer: Phaser.Time.TimerEvent;
    private readonly _shootDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    public get destroyedOnContact(): boolean {
        return this._data.destroyedOnContact;
    }

    public init(data: SpreadEnemyData, bulletsGroup: Phaser.Physics.Arcade.Group, target: Entity) {
        this._data = data;
        this._target = target;
        this._tintColor = Phaser.Display.Color.HexStringToColor(data.tint).color;

        this.setTexture('sprites', data.texture);
        this.setScale(data.scale);
        this.setTint(this._tintColor);
        // Radius in texture pixels: the body applies the sprite scale itself
        this.arcadeBody.setCircle(this.width / 2);

        const bulletData: BulletData = {
            ...data.bullet,
            color: Phaser.Display.Color.HexStringToColor(data.bullet.color).color
        };

        this.addComponent(new Health(data.health, this));
        this.addComponent(new SineMovement(data.movement.amplitude, data.movement.frequency));
        this.addComponent(new SpreadWeapon(bulletsGroup, bulletData, data.spreadShot));

        // Listen once per enemy, not on every enable(): pooled enemies are reused many times
        const health = this.getComponent(Health)!;
        health.on(Health.CHANGE_EVENT, () => this.onHit(health));

        this._shootTimerConfig = {
            delay: Phaser.Math.Between(data.spreadShot.fireDelayMin, data.spreadShot.fireDelayMax),
            callback: this.shoot,
            callbackScope: this,
            loop: true
        };
        this._shootTimer = this.scene.time.addEvent(this._shootTimerConfig);
    }

    public enable(x: number, y: number) {
        this.enableBody(true, x, y, true, true);
        this._isHitFlashing = false;
        this.setTint(this._tintColor);
        this._shootTimer.reset(this._shootTimerConfig);
        this.getComponent(SineMovement)?.reset();

        // Restore health, in case the enemy is reused from the pool, without emitting events
        const health = this.getComponent(Health);
        if (health)
            health.heal(health.max, false);
    }

    public disable() {
        this.disableBody(true, true);
        this._shootTimer.paused = true;
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        // Slowed down while flashing from a hit
        const moveDeltaTime: number = this._isHitFlashing ? deltaTime * SpreadEnemy.HIT_SLOWDOWN_FACTOR : deltaTime;

        const sineMovement = this.getComponent(SineMovement)!;
        sineMovement.update(moveDeltaTime);
        this.move(sineMovement, moveDeltaTime);
    }

    protected abstract move(sineMovement: SineMovement, deltaTime: number): void;

    private onHit(health: Health) {
        this._isHitFlashing = true;
        this.setTintFill(SpreadEnemy.HIT_FLASH_COLOR);

        if (health.current == 0)
            this.disableBody();

        this.scene.time.delayedCall(SpreadEnemy.HIT_FLASH_DURATION, () => {
            this._isHitFlashing = false;
            // Back to the enemy color, not clearTint(): the tint is what makes it look different
            this.setTint(this._tintColor);

            if (health.current == 0)
                this.disable();
        });
    }

    private shoot() {
        if (this._data.spreadShot.aimAtTarget)
            this._shootDirection.set(this._target.x - this.x, this._target.y - this.y).normalize();
        else
            this._shootDirection.setToPolar(this.rotation, 1);

        this.getComponent(SpreadWeapon)?.shoot(this, this._shootDirection);
        this.scene.sound.play(SpreadEnemy.SHOOT_SOUND_KEY);
    }
}
