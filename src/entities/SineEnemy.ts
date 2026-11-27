import SpreadEnemy from "./SpreadEnemy.ts";
import Movement from "../components/Movement.ts";
import SineMovement from "../components/SineMovement.ts";
import type {SpreadEnemyData} from "../gameData/EnemiesData.ts";

// Goes down the screen while waving from left to right
export default class SineEnemy extends SpreadEnemy {
    // Center of the wave: the x where the enemy spawned
    private _baseX: number = 0;

    public init(data: SpreadEnemyData, bulletsGroup: Phaser.Physics.Arcade.Group) {
        super.init(data, bulletsGroup);

        this.addComponent(new Movement(data.movement.speed));
    }

    public enable(x: number, y: number) {
        super.enable(x, y);

        this._baseX = x;
    }

    protected move(sineMovement: SineMovement, deltaTime: number) {
        // Recycle the enemy once it has left the screen at the bottom
        if (this.y > this.scene.cameras.main.height + this.displayHeight) {
            this.disable();
            return;
        }

        this.getComponent(Movement)?.moveVertically(this, deltaTime);
        this.x = this._baseX + sineMovement.offset;
    }
}
