import {Physics} from 'phaser';
import type {BulletData} from "../gameData/BulletData.ts";
import type {SpreadShotData} from "../gameData/EnemiesData.ts";
import Entity from "../entities/Entity.ts";
import Weapon from "./Weapon.ts";

// Shoots several bullets at once, spread evenly in a fan centered on the entity forward direction
export default class SpreadWeapon extends Weapon {
    private readonly _count: number;
    private readonly _spreadAngle: number;
    private readonly _bulletDirection: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    constructor(bullets: Physics.Arcade.Group, bulletData: BulletData, spreadShotData: SpreadShotData) {
        super(bullets, bulletData);

        this._count = Math.max(1, spreadShotData.count);
        this._spreadAngle = Phaser.Math.DegToRad(spreadShotData.angle);
    }

    public shoot(source: Entity) {
        if (!this.enabled)
            return;

        // On a full circle the first and last bullets would overlap: divide by count instead of count - 1
        const isFullCircle: boolean = this._spreadAngle >= Phaser.Math.PI2;
        const gaps: number = isFullCircle ? this._count : this._count - 1;
        const step: number = gaps > 0 ? this._spreadAngle / gaps : 0;
        const startAngle: number = isFullCircle || this._count === 1 ? source.rotation : source.rotation - this._spreadAngle / 2;

        for (let i: number = 0; i < this._count; i++) {
            this._bulletDirection.setToPolar(startAngle + i * step, 1);
            super.shoot(source, this._bulletDirection);
        }
    }
}
