import SpreadEnemy from "./SpreadEnemy.ts";
import SineMovement from "../components/SineMovement.ts";
import type {BossData} from "../gameData/EnemiesData.ts";

// Comes down from the top of the screen to a horizontal line, then moves from left to right on it
export default class BossEnemy extends SpreadEnemy {
    private _lineY: number;

    public init(data: BossData, bulletsGroup: Phaser.Physics.Arcade.Group) {
        super.init(data, bulletsGroup);

        this._lineY = data.movement.lineY;
    }

    protected move(sineMovement: SineMovement, deltaTime: number) {
        // Enter the screen from the top until the line is reached, then stay on it
        this.y = Math.min(this.y + this._data.movement.speed * deltaTime, this._lineY);
        this.x = this.scene.cameras.main.centerX + sineMovement.offset;
    }
}
