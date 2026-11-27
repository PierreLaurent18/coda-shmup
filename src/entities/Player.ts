import {GameObjects, Input, Scene} from "phaser";
import {PlayerShipData, PlayerShipsData} from "../gameData/PlayerShipsData.ts";
import type {BulletData} from "../gameData/BulletData.ts";
import type {PowerUpsData, PowerUpType} from "../gameData/PowerUpsData.ts";
import Entity from './Entity.ts';
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";
import SpreadWeapon from "../components/SpreadWeapon.ts";
import GameConstants from "../GameConstants.ts";

export default class Player extends Entity {
    private static readonly SHOOT_SOUND_KEY: string = 'sfx_laser1';
    private static readonly SHIELD_RADIUS: number = 72;
    private static readonly SHIELD_FILL_ALPHA: number = 0.15;
    private static readonly SHIELD_STROKE_WIDTH: number = 4;
    private static readonly CHEAT_INVINCIBLE_ALPHA: number = 0.5;

    private readonly _bulletData: BulletData = {
        width: 12,
        height: 4,
        color: 0xffe066,
        speed: 1024,
        damage: 1
    };

    private readonly _cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys;
    private _playerShipData: PlayerShipData;
    private _rateOfFire: number;
    private _lastShotTime: number;

    // Kept as fields: SpreadWeapon is also a Weapon, getComponent(Weapon) could return either
    private _weapon: Weapon;
    private _multiShotWeapon: SpreadWeapon;

    private _powerUpsData: PowerUpsData;
    private _isMultiShotActive: boolean = false;
    private _isShieldActive: boolean = false;
    private _isCheatInvincible: boolean = false;
    private _speedMultiplier: number = 1;
    private _fireRateMultiplier: number = 1;
    private _shieldVisual: GameObjects.Arc;
    private readonly _powerUpTimers: Map<PowerUpType, Phaser.Time.TimerEvent> = new Map();

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'sprites');

        if (this.scene.input.keyboard) {
            this._cursorKeys = this.scene.input.keyboard.createCursorKeys();

            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.ONE).on('down', () => this.selectPlayerShip(1));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.TWO).on('down', () => this.selectPlayerShip(2));
            this.scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.THREE).on('down', () => this.selectPlayerShip(3));
        }
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group) {
        this._powerUpsData = this.scene.cache.json.get(GameConstants.DataKeys.POWER_UPS) as PowerUpsData;

        this._weapon = new Weapon(bulletsGroup, this._bulletData);
        this._multiShotWeapon = new SpreadWeapon(bulletsGroup, this._bulletData, this._powerUpsData.multiShot);

        this.addComponent(new Health(3, this));
        this.addComponent(new Movement());
        this.addComponent(this._weapon);
        this.addComponent(this._multiShotWeapon);

        const shieldColor: number = Phaser.Display.Color.HexStringToColor(this._powerUpsData.shield.tint).color;
        this._shieldVisual = this.scene.add.circle(this.x, this.y, Player.SHIELD_RADIUS, shieldColor, Player.SHIELD_FILL_ALPHA)
            .setStrokeStyle(Player.SHIELD_STROKE_WIDTH, shieldColor)
            .setVisible(false);

        this.angle = -90;

        this.selectPlayerShip(1);

        this._rateOfFire = 0.5;
        this._lastShotTime = 0;

        this.getComponent(Health)?.on(Health.CHANGE_EVENT, () => {
            this.arcadeBody.setEnable(false);

            this.scene.time.delayedCall(50, () => {
                // A dead player stays disabled
                if (this.active)
                    this.arcadeBody.setEnable(true);
            });
        });
        this.getComponent(Health)?.once(Health.DEATH_EVENT, () => this._shieldVisual.setVisible(false));
    }

    public selectPlayerShip(playerShipDataId: number) {
        const playerShipsData = this.scene.cache.json.get('playerShips') as PlayerShipsData;
        this._playerShipData = playerShipsData[playerShipDataId];

        this.setTexture('sprites', this._playerShipData.texture);
        const bodyData = this._playerShipData.body;
        this.arcadeBody.setCircle(bodyData.radius, bodyData.offsetX, bodyData.offsetY);

        this.updateMovementSpeed();
    }

    // Starts the power-up effect, or restarts its duration if already active
    public applyPowerUp(type: PowerUpType) {
        this._powerUpTimers.get(type)?.remove();

        this.setPowerUpActive(type, true);
        this._powerUpTimers.set(type, this.scene.time.delayedCall(this._powerUpsData[type].duration, () => {
            this.setPowerUpActive(type, false);
            this._powerUpTimers.delete(type);
        }));
    }

    // Test cheat
    public toggleCheatInvincibility() {
        this._isCheatInvincible = !this._isCheatInvincible;
        this.setAlpha(this._isCheatInvincible ? Player.CHEAT_INVINCIBLE_ALPHA : 1);
        this.updateInvincibility();
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        // Press left or right arrow keys to move the player smoothly horizontally using deltaTime
        if (this._cursorKeys.left.isDown) {
            if (this._cursorKeys.shift.isDown) {
                this.angle -= this._playerShipData.movementSpeed * deltaTime;
            } else {
                this.getComponent(Movement)?.moveHorizontally(this, -deltaTime);
            }
        } else if (this._cursorKeys.right.isDown) {
            if (this._cursorKeys.shift.isDown) {
                this.angle += this._playerShipData.movementSpeed * deltaTime;
            } else {
                this.getComponent(Movement)?.moveHorizontally(this, deltaTime);
            }
        }
        // Stop player from going offscreen
        this.x = Phaser.Math.Clamp(this.x, this.displayWidth / 2, this.scene.cameras.main.width - this.displayWidth / 2);

        this._shieldVisual.setPosition(this.x, this.y);

        // Press space to shoot
        if (this._cursorKeys.space.isDown) {
            if (timeSinceLaunch - this._lastShotTime > this._rateOfFire * 1000 / this._fireRateMultiplier) {
                if (this._isMultiShotActive)
                    this._multiShotWeapon.shoot(this);
                else
                    this._weapon.shoot(this);
                this.scene.sound.play(Player.SHOOT_SOUND_KEY);

                this._lastShotTime = timeSinceLaunch;
            }
        }
    }

    private setPowerUpActive(type: PowerUpType, isActive: boolean) {
        switch (type) {
            case 'multiShot':
                this._isMultiShotActive = isActive;
                break;
            case 'shield':
                this._isShieldActive = isActive;
                this._shieldVisual.setVisible(isActive && this.active);
                this.updateInvincibility();
                break;
            case 'speed':
                this._speedMultiplier = isActive ? this._powerUpsData.speed.multiplier : 1;
                this.updateMovementSpeed();
                break;
            case 'rapidFire':
                this._fireRateMultiplier = isActive ? this._powerUpsData.rapidFire.multiplier : 1;
                break;
        }
    }

    // The shield and the test cheat both make the player invincible: the end of one must not cancel the other
    private updateInvincibility() {
        // A disabled Health ignores damage
        this.getComponent(Health)!.enabled = !(this._isShieldActive || this._isCheatInvincible);
    }

    private updateMovementSpeed() {
        this.getComponent(Movement)?.setSpeed(this._playerShipData.movementSpeed * this._speedMultiplier);
    }
}
