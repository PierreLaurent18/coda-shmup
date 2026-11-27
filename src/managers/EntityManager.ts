import {GameObjects, Plugins, Physics, Scene} from "phaser";
import Health from "../components/Health.ts";
import Bullet from "../entities/Bullet.ts";
import Enemy from "../entities/Enemy.ts";
import Player from "../entities/Player.ts";
import SpreadEnemy from "../entities/SpreadEnemy.ts";
import SineEnemy from "../entities/SineEnemy.ts";
import BossEnemy from "../entities/BossEnemy.ts";
import type {EnemiesData, SpreadEnemyData} from "../gameData/EnemiesData.ts";
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
    // No other enemy spawns while a boss is alive
    private _isBossFight: boolean = false;

    // Keep sine enemies away from the screen sides, on top of their wave amplitude
    private static readonly SINE_ENEMY_SPAWN_MARGIN: number = 64;

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

        this._player = new Player(this.scene!, this.scene!.cameras.main.centerX, this.scene!.cameras.main.height - 128);
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
                (enemy as Enemy).init(this._enemyBullets);
            }
        });

        // Spawn enemies indefinitely
        this.scene!.time.addEvent({
            delay: 1500,
            callback: this.spawnEnemy,
            callbackScope: this,
            loop: true
        });

        this.initSpreadEnemies();

        console.log("[EntityManager] Enemies initialized");

        return this._enemies;
    }

    public initGroupCollisions() {
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

        console.log("[EntityManager] Group collisions initialized");
    }

    private initSpreadEnemies() {
        // The plugin outlives a scene restart: a restart during a boss fight must not keep blocking spawns
        this._isBossFight = false;

        const enemiesData = this.scene!.cache.json.get(GameConstants.DataKeys.ENEMIES) as EnemiesData;
        const camera = this.scene!.cameras.main;

        this._sineEnemies = this.createSpreadEnemyGroup(SineEnemy, enemiesData.sineEnemy);
        this.scene!.time.addEvent({
            delay: enemiesData.sineEnemy.spawn.delay,
            callback: () => {
                // The whole wave must stay inside the screen
                const sideMargin = enemiesData.sineEnemy.movement.amplitude + EntityManager.SINE_ENEMY_SPAWN_MARGIN;
                const x = Phaser.Math.Between(sideMargin, camera.width - sideMargin);
                if (!this._isBossFight)
                    this.spawnSpreadEnemy(this._sineEnemies, enemiesData.sineEnemy, x);
            },
            loop: true
        });

        this._bosses = this.createSpreadEnemyGroup(BossEnemy, enemiesData.boss);
        this.scene!.time.addEvent({
            delay: enemiesData.boss.spawn.delay,
            callback: () => this.spawnBoss(enemiesData.boss, camera.centerX),
            loop: true
        });
    }

    // One pool per enemy type: a pooled enemy is always reused with the same data
    private createSpreadEnemyGroup(classType: typeof SineEnemy | typeof BossEnemy, data: SpreadEnemyData): Physics.Arcade.Group {
        return this.scene!.physics.add.group({
            classType: classType,
            defaultKey: 'sprites',
            defaultFrame: data.texture,
            createCallback: (enemy) => {
                (enemy as SpreadEnemy).init(data, this._enemyBullets);
            }
        });
    }

    // Spawns just above the top of the screen
    private spawnSpreadEnemy(group: Physics.Arcade.Group, data: SpreadEnemyData, x: number): SpreadEnemy | null {
        if (group.countActive(true) >= data.spawn.maxActive)
            return null;

        const enemy = group.get() as SpreadEnemy | null;
        if (!enemy)
            return null;

        enemy.enable(x, -enemy.displayHeight);

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);

        return enemy;
    }

    private spawnBoss(data: SpreadEnemyData, x: number) {
        if (this._isBossFight)
            return;

        const boss = this.spawnSpreadEnemy(this._bosses, data, x);
        if (!boss)
            return;

        this._isBossFight = true;

        // once: the boss is pooled, the next spawn will listen again
        boss.getComponent(Health)?.once(Health.DEATH_EVENT, () => {
            this._isBossFight = false;
        });
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

    private spawnEnemy() {
        if (this._isBossFight || this._enemies.countActive(true) >= 5) {
            return;
        }

        const enemy = this._enemies.get() as Enemy;
        if (!enemy) {
            return;
        }

        enemy.enable(Phaser.Math.Between(64, this.scene!.cameras.main.width - 64), 0);

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);

        console.log("[EntityManager] Enemy spawned");
    }
}