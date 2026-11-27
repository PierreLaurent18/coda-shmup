import SpreadEnemy from "./SpreadEnemy.ts";
import Movement from "../components/Movement.ts";
import SineMovement from "../components/SineMovement.ts";
import type {SpreadEnemyData} from "../gameData/EnemiesData.ts";
import Entity from "./Entity.ts";

// Goes toward the player while waving from side to side
export default class SineEnemy extends SpreadEnemy {
    private readonly _directionToTarget: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private readonly _waveDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    public init(data: SpreadEnemyData, bulletsGroup: Phaser.Physics.Arcade.Group, target: Entity) {
        super.init(data, bulletsGroup, target);

        this.addComponent(new Movement(data.movement.speed));
    }

    protected move(sineMovement: SineMovement, deltaTime: number) {
        this._directionToTarget.set(this._target.x - this.x, this._target.y - this.y).normalize();
        this.rotation = this._directionToTarget.angle();

        // Forward, toward the player
        this.getComponent(Movement)?.move(this, this._directionToTarget, deltaTime);

        // Sideways: the wave is perpendicular to the forward direction.
        // Apply only the offset change since last frame, the forward move already handles the rest
        this._waveDirection.copy(this._directionToTarget).normalizeRightHand();
        this.x += this._waveDirection.x * sineMovement.offsetDelta;
        this.y += this._waveDirection.y * sineMovement.offsetDelta;
    }
}
