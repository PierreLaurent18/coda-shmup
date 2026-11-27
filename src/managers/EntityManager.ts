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
    private readonly _spawnOffset: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private readonly _spawnPosition: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    // Distance above the camera view where the boss appears, before going down to its line
    private static readonly BOSS_SPAWN_MARGIN: number = 256;

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

        console.log("[EntityManager] Group collisions initialized");
    }

    private initSpreadEnemies() {
        const enemiesData = this.scene!.cache.json.get(GameConstants.DataKeys.ENEMIES) as EnemiesData;

        this._sineEnemies = this.createSpreadEnemyGroup(SineEnemy, enemiesData.sineEnemy);
        this.scene!.time.addEvent({
            delay: enemiesData.sineEnemy.spawn.delay,
            callback: () => {
                this.getOffscreenSpawnPosition(this._spawnPosition);
                this.spawnSpreadEnemy(this._sineEnemies, enemiesData.sineEnemy, this._spawnPosition);
            },
            loop: true
        });

        this._bosses = this.createSpreadEnemyGroup(BossEnemy, enemiesData.boss);
        this.scene!.time.addEvent({
            delay: enemiesData.boss.spawn.delay,
            callback: () => {
                const view = this.scene!.cameras.main.worldView;
                this._spawnPosition.set(view.centerX, view.top - EntityManager.BOSS_SPAWN_MARGIN);
                this.spawnSpreadEnemy(this._bosses, enemiesData.boss, this._spawnPosition);
            },
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
                (enemy as SpreadEnemy).init(data, this._enemyBullets, this._player);
            }
        });
    }

    private spawnSpreadEnemy(group: Physics.Arcade.Group, data: SpreadEnemyData, position: Phaser.Math.Vector2) {
        if (group.countActive(true) >= data.spawn.maxActive)
            return;

        const enemy = group.get() as SpreadEnemy | null;
        if (!enemy)
            return;

        enemy.enable(position.x, position.y);

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);
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
        if (this._enemies.countActive(true) >= 50) {
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