import SpreadEnemy from "./SpreadEnemy.ts";
import SineMovement from "../components/SineMovement.ts";
import type {BossData} from "../gameData/EnemiesData.ts";
import Entity from "./Entity.ts";

// Stays on a horizontal line at the top of the screen and moves from left to right
export default class BossEnemy extends SpreadEnemy {
    private _lineOffsetY: number;
    // Current distance to the top of the camera view: starts above it, then goes down to the line
    private _offsetY: number = 0;

    public init(data: BossData, bulletsGroup: Phaser.Physics.Arcade.Group, target: Entity) {
        super.init(data, bulletsGroup, target);

        this._lineOffsetY = data.movement.lineOffsetY;
        // Face down: with aimAtTarget false, the spread shot goes straight down
        this.rotation = Math.PI / 2;
    }

    public enable(x: number, y: number) {
        super.enable(x, y);

        this._offsetY = y - this.scene.cameras.main.worldView.top;
    }

    protected move(sineMovement: SineMovement, deltaTime: number) {
        // Enter the screen from the top until the line is reached
        this._offsetY = Math.min(this._offsetY + this._data.movement.speed * deltaTime, this._lineOffsetY);

        // Follow the camera so the boss is always on screen
        const view = this.scene.cameras.main.worldView;
        this.setPosition(view.centerX + sineMovement.offset, view.top + this._offsetY);
    }
}
