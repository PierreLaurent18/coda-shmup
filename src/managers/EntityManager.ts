import {GameObjects, Plugins, Physics, Scene} from "phaser";
import Health from "../components/Health.ts";
import Bullet from "../entities/Bullet.ts";
import Enemy from "../entities/Enemy.ts";
import Player from "../entities/Player.ts";
import SpreadEnemy from "../entities/SpreadEnemy.ts";
import SineEnemy from "../entities/SineEnemy.ts";
import BossEnemy from "../entities/BossEnemy.ts";
import Entity from "../entities/Entity.ts";
import PowerUp from "../entities/PowerUp.ts";
import LaserWeapon from "../components/LaserWeapon.ts";
import type {EnemiesData, SpreadEnemyData} from "../gameData/EnemiesData.ts";
import type {AbilitiesData, PowerUpsData, PowerUpType} from "../gameData/AbilitiesData.ts";
import GroupUtils from "../utils/GroupUtils.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";

export default class EntityManager extends Plugins.ScenePlugin {
    public static readonly PLUGIN_KEY: string = 'EntityManager';
    public static readonly MAPPING_NAME: string = 'entityManager';

    // noinspection JSUnusedGlobalSymbols
    private readonly bulletGroupConfig = {
        classType: Bullet,
        maxSize: 256,
        runChildUpdate: true,
        createCallback: (bullet: GameObjects.GameObject) => {
            (bullet as Bullet).init();
        }
    }

    private _player: Player;
    private _playerBullets: Physics.Arcade.Group;
    private _enemies: Physics.Arcade.Group;
    private _enemyBullets: Physics.Arcade.Group;
    private _sineEnemies: Physics.Arcade.Group;
    private _bosses: Physics.Arcade.Group;
    private _powerUps: Physics.Arcade.Group;
    private _powerUpsData: PowerUpsData;
    // No other enemy spawns while a boss is alive
    private _isBossFight: boolean = false;
    private readonly _laserHitArea: Phaser.Geom.Circle = new Phaser.Geom.Circle();
    private readonly _spawnOffset: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private readonly _spawnPosition: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    // Distance above the camera view where the boss appears, before going down to its line
    private static readonly BOSS_SPAWN_MARGIN: number = 256;
    // Boss drops are spread around it so they don't stack
    private static readonly BOSS_DROP_SPREAD: number = 96;
    private static readonly PICKUP_TEXT_SIZE: number = 48;
    private static readonly PICKUP_TEXT_RISE: number = 96;
    private static readonly PICKUP_TEXT_DURATION: number = 800;
    private static readonly LASER_SHAKE_DURATION: number = 150;
    private static readonly LASER_SHAKE_INTENSITY: number = 0.01;

    constructor(scene: Scene, pluginManager: Plugins.PluginManager) {
        super(scene, pluginManager, EntityManager.PLUGIN_KEY);

        console.log("[EntityManager] Initialized");
    }

    destroy() {
        super.destroy();

        console.log("[EntityManager] Destroyed");
    }

    public initAndSpawnPlayer(): Player {
        this._playerBullets = this.scene!.physics.add.group(this.bulletGroupConfig);
        GroupUtils.populate(64, this._playerBullets);

        this._player = new Player(this.scene!, GameConstants.ARENA_WIDTH / 2, GameConstants.ARENA_HEIGHT / 2);
        this._player.init(this._playerBullets);

        console.log("[EntityManager] Player spawned");

        this.game!.events.emit(GameConstants.Events.PLAYER_SPAWNED_EVENT, this._player);

        return this._player;
    }

    public initEnemies(): Physics.Arcade.Group {
        this._enemyBullets = this.scene!.physics.add.group(this.bulletGroupConfig);
        GroupUtils.populate(256, this._enemyBullets);

        this._enemies = this.scene!.physics.add.group({
            classType: Enemy,
            defaultKey: 'sprites',
            defaultFrame: 'ufoRed',
            createCallback: (enemy) => {
                (enemy as Enemy).init(this._enemyBullets, this._player);
                this.listenForPowerUpDrop(enemy as Enemy, false);
            }
        });

        // Spawn enemies indefinitely
        this.scene!.time.addEvent({
            delay: 500,
            callback: this.spawnEnemy,
            callbackScope: this,
            loop: true
        });

        this.initSpreadEnemies();
        this.initPowerUps();

        this._player.setTargets(this._enemies, this._sineEnemies, this._bosses);

        console.log("[EntityManager] Enemies initialized");

        return this._enemies;
    }

    public initGroupCollisions() {
        // Push enemies apart so they don't stack into a single blob
        this.scene!.physics.add.collider(this._enemies, this._enemies);

        this.scene!.physics.add.overlap(this._playerBullets, this._enemies, (bullet, enemy) => {
            this.scene!.registry.inc(RegistryConstants.Keys.PLAYER_SCORE);

            (bullet as Bullet).disable();
            (enemy as Enemy).getComponent(Health)?.damage((bullet as Bullet).damage);
        });

        this.scene!.physics.add.overlap(this._player, this._enemyBullets, (player, bullet) => {
            (bullet as Bullet).disable();
            (player as Player).getComponent(Health)?.damage((bullet as Bullet).damage);

            this.scene?.cameras.main.shake(100, 0.01);
        });

        this.scene!.physics.add.overlap(this._player, this._enemies, (player, enemy) => {
            this.scene!.registry.inc(RegistryConstants.Keys.PLAYER_SCORE);

            const enemyHealth = (enemy as Enemy).getComponent(Health);
            enemyHealth?.damage(enemyHealth?.max);

            const playerHealth = (player as Player).getComponent(Health);
            playerHealth?.damage(1);

            this.scene?.cameras.main.shake(100, 0.03);
        });

        this.initSpreadEnemyCollisions(this._sineEnemies);
        this.initSpreadEnemyCollisions(this._bosses);

        this.scene!.physics.add.overlap(this._player, this._powerUps, (_player, powerUp) => {
            this.pickUpPowerUp(powerUp as PowerUp);
        });

        this._player.getComponent(LaserWeapon)?.on(LaserWeapon.FIRE_EVENT, this.onLaserFired, this);

        console.log("[EntityManager] Group collisions initialized");
    }

    private initSpreadEnemies() {
        // The plugin outlives a scene restart: a restart during a boss fight must not keep blocking spawns
        this._isBossFight = false;

        const enemiesData = this.scene!.cache.json.get(GameConstants.DataKeys.ENEMIES) as EnemiesData;

        this._sineEnemies = this.createSpreadEnemyGroup(SineEnemy, enemiesData.sineEnemy);
        this.scene!.time.addEvent({
            delay: enemiesData.sineEnemy.spawn.delay,
            callback: () => {
                if (this._isBossFight)
                    return;

                this.getOffscreenSpawnPosition(this._spawnPosition);
                this.spawnSpreadEnemy(this._sineEnemies, enemiesData.sineEnemy, this._spawnPosition);
            },
            loop: true
        });

        this._bosses = this.createSpreadEnemyGroup(BossEnemy, enemiesData.boss, true);
        this.scene!.time.addEvent({
            delay: enemiesData.boss.spawn.delay,
            callback: () => this.spawnBoss(enemiesData.boss),
            loop: true
        });
    }

    private initPowerUps() {
        this._powerUpsData = (this.scene!.cache.json.get(GameConstants.DataKeys.ABILITIES) as AbilitiesData).powerUps;

        this._powerUps = this.scene!.physics.add.group({
            classType: PowerUp,
            defaultKey: 'sprites',
            defaultFrame: this._powerUpsData.multiShot.frame
        });
    }

    // One pool per enemy type: a pooled enemy is always reused with the same data
    private createSpreadEnemyGroup(classType: typeof SineEnemy | typeof BossEnemy, data: SpreadEnemyData,
                                   isBoss: boolean = false): Physics.Arcade.Group {
        return this.scene!.physics.add.group({
            classType: classType,
            defaultKey: 'sprites',
            defaultFrame: data.texture,
            createCallback: (enemy) => {
                (enemy as SpreadEnemy).init(data, this._enemyBullets, this._player);
                this.listenForPowerUpDrop(enemy as SpreadEnemy, isBoss);
            }
        });
    }

    private spawnSpreadEnemy(group: Physics.Arcade.Group, data: SpreadEnemyData, position: Phaser.Math.Vector2): SpreadEnemy | null {
        if (group.countActive(true) >= data.spawn.maxActive)
            return null;

        const enemy = group.get() as SpreadEnemy | null;
        if (!enemy)
            return null;

        enemy.enable(position.x, position.y);

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);

        return enemy;
    }

    private spawnBoss(data: SpreadEnemyData) {
        if (this._isBossFight)
            return;

        const view = this.scene!.cameras.main.worldView;
        this._spawnPosition.set(view.centerX, view.top - EntityManager.BOSS_SPAWN_MARGIN);
        const boss = this.spawnSpreadEnemy(this._bosses, data, this._spawnPosition);
        if (!boss)
            return;

        this._isBossFight = true;
        this.game!.events.emit(GameConstants.Events.BOSS_FIGHT_STARTED_EVENT, boss);

        // once: the boss is pooled, the next spawn will listen again
        boss.getComponent(Health)?.once(Health.DEATH_EVENT, () => {
            this._isBossFight = false;
            this.game!.events.emit(GameConstants.Events.BOSS_FIGHT_ENDED_EVENT);
        });
    }

    // Listen once per pooled enemy, not on every spawn
    private listenForPowerUpDrop(enemy: Entity, isBoss: boolean) {
        enemy.getComponent(Health)?.on(Health.DEATH_EVENT, () => {
            if (isBoss) {
                for (let i: number = 0; i < this._powerUpsData.bossDropCount; i++) {
                    Phaser.Math.RandomXY(this._spawnOffset, EntityManager.BOSS_DROP_SPREAD);
                    this.spawnPowerUp(enemy.x + this._spawnOffset.x, enemy.y + this._spawnOffset.y);
                }
            } else if (Math.random() < this._powerUpsData.dropChance) {
                this.spawnPowerUp(enemy.x, enemy.y);
            }
        });
    }

    private spawnPowerUp(x: number, y: number) {
        const powerUp = this._powerUps.get() as PowerUp | null;
        if (!powerUp)
            return;

        const types: PowerUpType[] = ['multiShot', 'shield', 'speed'];
        const type: PowerUpType = Phaser.Utils.Array.GetRandom(types);
        powerUp.enable(x, y, type, this._powerUpsData[type], this._powerUpsData.lifetime);
    }

    private pickUpPowerUp(powerUp: PowerUp) {
        const data = this._powerUpsData[powerUp.powerUpType];
        this._player.applyPowerUp(powerUp.powerUpType);
        powerUp.disable();

        // Feedback: the power-up name floats up and fades out
        const text = this.scene!.add.bitmapText(powerUp.x, powerUp.y, 'future-bmp', data.label, EntityManager.PICKUP_TEXT_SIZE)
            .setOrigin(0.5)
            .setTint(Phaser.Display.Color.HexStringToColor(data.tint).color);
        this.scene!.tweens.add({
            targets: text,
            y: text.y - EntityManager.PICKUP_TEXT_RISE,
            alpha: 0,
            duration: EntityManager.PICKUP_TEXT_DURATION,
            onComplete: () => text.destroy()
        });
    }

    // Damages every enemy touched by the beam
    private onLaserFired(beam: Phaser.Geom.Line, width: number, damage: number) {
        for (const group of [this._enemies, this._sineEnemies, this._bosses]) {
            for (const enemy of group.getMatching('active', true) as Entity[]) {
                // Body already disabled: the enemy is dying
                if (!enemy.arcadeBody.enable)
                    continue;

                const body = enemy.arcadeBody;
                this._laserHitArea.setTo(body.center.x, body.center.y, body.halfWidth + width / 2);
                if (Phaser.Geom.Intersects.LineToCircle(beam, this._laserHitArea)) {
                    this.scene!.registry.inc(RegistryConstants.Keys.PLAYER_SCORE);
                    enemy.getComponent(Health)?.damage(damage);
                }
            }
        }

        this.scene?.cameras.main.shake(EntityManager.LASER_SHAKE_DURATION, EntityManager.LASER_SHAKE_INTENSITY);
    }

    private initSpreadEnemyCollisions(group: Physics.Arcade.Group) {
        this.scene!.physics.add.overlap(this._playerBullets, group, (bullet, enemy) => {
            this.scene!.registry.inc(RegistryConstants.Keys.PLAYER_SCORE);

            (bullet as Bullet).disable();
            (enemy as SpreadEnemy).getComponent(Health)?.damage((bullet as Bullet).damage);
        });

        this.scene!.physics.add.overlap(this._player, group, (player, enemy) => {
            const spreadEnemy = enemy as SpreadEnemy;

            // A boss survives the contact, touching it only hurts the player
            if (spreadEnemy.destroyedOnContact) {
                this.scene!.registry.inc(RegistryConstants.Keys.PLAYER_SCORE);

                const enemyHealth = spreadEnemy.getComponent(Health);
                enemyHealth?.damage(enemyHealth?.max);
            }

            (player as Player).getComponent(Health)?.damage(1);

            this.scene?.cameras.main.shake(100, 0.03);
        });
    }

    // On a circle around the camera view, a bit further than its corners: always outside the screen.
    // Centered on the view, not the player: at the arena edges the camera stops and the player is off-center
    private getOffscreenSpawnPosition(out: Phaser.Math.Vector2) {
        const view = this.scene!.cameras.main.worldView;
        const spawnRadius = Phaser.Math.Distance.Between(view.centerX, view.centerY, view.right, view.top) + 128;
        Phaser.Math.RandomXY(this._spawnOffset, spawnRadius);
        out.set(view.centerX + this._spawnOffset.x, view.centerY + this._spawnOffset.y);
    }

    private spawnEnemy() {
        if (this._isBossFight || this._enemies.countActive(true) >= 50) {
            return;
        }

        const enemy = this._enemies.get() as Enemy;
        if (!enemy) {
            return;
        }

        this.getOffscreenSpawnPosition(this._spawnPosition);
        enemy.enable(this._spawnPosition.x, this._spawnPosition.y);

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);

        console.log("[EntityManager] Enemy spawned");
    }
}