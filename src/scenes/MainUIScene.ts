import {GameObjects, Scenes, Scene} from "phaser";
import Health from "../components/Health.ts";
import LaserWeapon from "../components/LaserWeapon.ts";
import Player from "../entities/Player.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";

export default class MainUIScene extends Scene {
    private static readonly LASER_BAR_WIDTH: number = 480;
    private static readonly LASER_BAR_HEIGHT: number = 28;
    private static readonly LASER_BAR_BOTTOM_MARGIN: number = 120;
    private static readonly LASER_LABEL_SIZE: number = 40;
    private static readonly LASER_BAR_BACKGROUND_COLOR: number = 0x222222;
    private static readonly LASER_BAR_COLOR: number = 0x66e0ff;
    private static readonly LASER_BAR_FULL_COLOR: number = 0xffffff;

    private _playerHealthText: GameObjects.BitmapText;
    private _scoreText: GameObjects.BitmapText;
    private _laserBarFill: GameObjects.Rectangle;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_UI);
    }

    // noinspection JSUnusedGlobalSymbols
    init() {
        this.game.events.on(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
        this.registry.events.on(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
            this.registry.events.off(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);
        }, this);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        const playerHealthIcon = this.add.image(64, 64, "sprites", "playerLife1_blue")
            .setOrigin(0, 0).setScale(1.5);
        const playerHealthTextX = playerHealthIcon.x + playerHealthIcon.displayWidth + 16;
        this._playerHealthText = this.add.bitmapText(playerHealthTextX, 64, "future-bmp", "x0", 128);

        let scoreStr: string = "".padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        if (this.registry.has(RegistryConstants.Keys.PLAYER_SCORE))
            scoreStr = this.registry.get(RegistryConstants.Keys.PLAYER_SCORE).toString()
                .padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText = this.add.bitmapText(this.scale.width - 64, 64, "future-bmp", scoreStr, 128)
            .setOrigin(1, 0);

        // Laser charge bar, bottom center
        const laserBarX: number = (this.scale.width - MainUIScene.LASER_BAR_WIDTH) / 2;
        const laserBarY: number = this.scale.height - MainUIScene.LASER_BAR_BOTTOM_MARGIN;
        this.add.rectangle(laserBarX, laserBarY, MainUIScene.LASER_BAR_WIDTH, MainUIScene.LASER_BAR_HEIGHT,
            MainUIScene.LASER_BAR_BACKGROUND_COLOR).setOrigin(0, 0.5);
        this._laserBarFill = this.add.rectangle(laserBarX, laserBarY, MainUIScene.LASER_BAR_WIDTH, MainUIScene.LASER_BAR_HEIGHT,
            MainUIScene.LASER_BAR_COLOR).setOrigin(0, 0.5);
        this.add.bitmapText(this.scale.width / 2, laserBarY - MainUIScene.LASER_BAR_HEIGHT, "future-bmp", "LASER",
            MainUIScene.LASER_LABEL_SIZE).setOrigin(0.5, 1);
        this.onLaserChargeChanged(0);

        this.scene.bringToTop();

        console.log("MainUIScene created");
    }

    private onPlayerScoreChanged(_: any, value: number) {
        const scoreStr: string = value.toString().padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText.setText(scoreStr);
    }

    private onPlayerSpawned(player: Player) {
        this._playerHealthText.setText("x" + player.getComponent(Health)?.current);

        player.getComponent(Health)?.on(Health.CHANGE_EVENT, (current: number) => {
            this._playerHealthText.setText("x" + current);
        }, this);

        player.getComponent(LaserWeapon)?.on(LaserWeapon.CHARGE_CHANGE_EVENT, this.onLaserChargeChanged, this);
    }

    // charge: 0 (empty) to 1 (full)
    private onLaserChargeChanged(charge: number) {
        this._laserBarFill.setScale(charge, 1);
        this._laserBarFill.setFillStyle(charge >= 1 ? MainUIScene.LASER_BAR_FULL_COLOR : MainUIScene.LASER_BAR_COLOR);
    }
}