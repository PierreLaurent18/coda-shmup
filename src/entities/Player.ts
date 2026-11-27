import {GameObjects, Input, Scene} from "phaser";
import {PlayerShipData, PlayerShipsData} from "../gameData/PlayerShipsData.ts";
import type {BulletData} from "../gameData/BulletData.ts";
import type {AbilitiesData, PowerUpsData, PowerUpType} from "../gameData/AbilitiesData.ts";
import Entity from './Entity.ts';
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";
import SpreadWeapon from "../components/SpreadWeapon.ts";
import LaserWeapon from "../components/LaserWeapon.ts";
import GameConstants from "../GameConstants.ts";

export default class Player extends Entity {
    private static readonly SHOOT_SOUND_KEY: string = 'sfx_laser1';
    private static readonly SHIELD_RADIUS: number = 72;
    private static readonly SHIELD_FILL_ALPHA: number = 0.15;
    private static readonly SHIELD_STROKE_WIDTH: number = 4;

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
    private readonly _moveDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private readonly _shootDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private _targets: Phaser.Physics.Arcade.Group[] = [];

    // Aim assist on the nearest enemy, turned off during a boss fight
    private _isAimAssistEnabled: boolean = true;

    // Kept as fields: SpreadWeapon is also a Weapon, getComponent(Weapon) could return either
    private _weapon: Weapon;
    private _multiShotWeapon: SpreadWeapon;

    private _powerUpsData: PowerUpsData;
    private _isMultiShotActive: boolean = false;
    private _speedMultiplier: number = 1;
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
        const abilitiesData = this.scene.cache.json.get(GameConstants.DataKeys.ABILITIES) as AbilitiesData;
        this._powerUpsData = abilitiesData.powerUps;

        this._weapon = new Weapon(bulletsGroup, this._bulletData);
        this._multiShotWeapon = new SpreadWeapon(bulletsGroup, this._bulletData, this._powerUpsData.multiShot);

        this.addComponent(new Health(3, this));
        this.addComponent(new Movement());
        this.addComponent(this._weapon);
        this.addComponent(this._multiShotWeapon);
        this.addComponent(new LaserWeapon(abilitiesData.laser));

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

        this.scene.game.events.on(GameConstants.Events.BOSS_FIGHT_STARTED_EVENT, this.onBossFightStarted, this);
        this.scene.game.events.on(GameConstants.Events.BOSS_FIGHT_ENDED_EVENT, this.onBossFightEnded, this);
        // game.events outlives the scene: stop listening when the scene stops or restarts
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scene.game.events.off(GameConstants.Events.BOSS_FIGHT_STARTED_EVENT, this.onBossFightStarted, this);
            this.scene.game.events.off(GameConstants.Events.BOSS_FIGHT_ENDED_EVENT, this.onBossFightEnded, this);
        });
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

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        // Build the move direction from the arrow keys
        this._moveDirection.set(0, 0);
        if (this._cursorKeys.left.isDown)
            this._moveDirection.x -= 1;
        if (this._cursorKeys.right.isDown)
            this._moveDirection.x += 1;
        if (this._cursorKeys.up.isDown)
            this._moveDirection.y -= 1;
        if (this._cursorKeys.down.isDown)
            this._moveDirection.y += 1;

        if (this._moveDirection.lengthSq() > 0) {
            this._moveDirection.normalize();
            this.getComponent(Movement)?.move(this, this._moveDirection, deltaTime);

            // Face the move direction
            this.rotation = this._moveDirection.angle();
        }

        // Stop player from leaving the arena
        this.x = Phaser.Math.Clamp(this.x, this.displayWidth / 2, GameConstants.ARENA_WIDTH - this.displayWidth / 2);
        this.y = Phaser.Math.Clamp(this.y, this.displayHeight / 2, GameConstants.ARENA_HEIGHT - this.displayHeight / 2);

        this._shieldVisual.setPosition(this.x, this.y);

        // Shoot automatically: at the nearest enemy, or straight ahead when aim assist is off
        if (timeSinceLaunch - this._lastShotTime > this._rateOfFire * 1000) {
            const hasTarget: boolean = this.computeAimDirection(this._shootDirection);
            if (hasTarget || !this._isAimAssistEnabled) {
                if (this._isMultiShotActive)
                    this._multiShotWeapon.shoot(this, this._shootDirection);
                else
                    this._weapon.shoot(this, this._shootDirection);
                this.scene.sound.play(Player.SHOOT_SOUND_KEY);

                this._lastShotTime = timeSinceLaunch;
            }
        }

        // Hold space to charge the laser, release to fire it
        const laser = this.getComponent(LaserWeapon)!;
        if (this._cursorKeys.space.isDown) {
            laser.addCharge(deltaTime);
        } else if (laser.charge > 0) {
            this.computeAimDirection(this._shootDirection);
            laser.release(this, this._shootDirection);
        }
    }

    // One group per enemy type: the player aims at the nearest enemy among all of them
    public setTargets(...targets: Phaser.Physics.Arcade.Group[]) {
        this._targets = targets;
    }

    // Fills out with the direction to the nearest enemy and returns true,
    // or with the forward direction and returns false when aim assist is off or there is no enemy
    private computeAimDirection(out: Phaser.Math.Vector2): boolean {
        const nearestTarget = this._isAimAssistEnabled ? this.findNearestTarget() : null;
        if (nearestTarget) {
            out.set(nearestTarget.x - this.x, nearestTarget.y - this.y).normalize();
            return true;
        }

        out.setToPolar(this.rotation, 1);
        return false;
    }

    private findNearestTarget(): Entity | null {
        const activeTargets = this._targets.flatMap(group => group.getMatching('active', true));
        return this.scene.physics.closest(this, activeTargets) as Entity | null;
    }

    private setPowerUpActive(type: PowerUpType, isActive: boolean) {
        switch (type) {
            case 'multiShot':
                this._isMultiShotActive = isActive;
                break;
            case 'shield':
                // A disabled Health ignores damage
                this.getComponent(Health)!.enabled = !isActive;
                this._shieldVisual.setVisible(isActive && this.active);
                break;
            case 'speed':
                this._speedMultiplier = isActive ? this._powerUpsData.speed.multiplier : 1;
                this.updateMovementSpeed();
                break;
        }
    }

    private updateMovementSpeed() {
        this.getComponent(Movement)?.setSpeed(this._playerShipData.movementSpeed * this._speedMultiplier);
    }

    private onBossFightStarted() {
        this._isAimAssistEnabled = false;
    }

    private onBossFightEnded() {
        this._isAimAssistEnabled = true;
    }
}
