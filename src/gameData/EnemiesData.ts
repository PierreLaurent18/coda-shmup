import type {BulletData} from "./BulletData.ts";

export type EnemiesData = {
    sineEnemy: SpreadEnemyData;
    boss: BossData;
}

export type SpreadEnemyData = {
    texture: string;
    // Hex string, e.g. "#7cf25c"
    tint: string;
    scale: number;
    health: number;
    // true: dies when it touches the player, false: survives (e.g. a boss)
    destroyedOnContact: boolean;
    spawn: SpawnData;
    movement: SineMovementData;
    spreadShot: SpreadShotData;
    bullet: EnemyBulletData;
}

export type BossData = SpreadEnemyData & {
    movement: SineMovementData & {
        // Height (px, from the top of the screen) of the line the boss moves on
        lineY: number;
    };
}

export type SpawnData = {
    // Time between two spawn attempts (ms)
    delay: number;
    maxActive: number;
}

export type SineMovementData = {
    // Downward speed (px/ms)
    speed: number;
    // Wave width (px)
    amplitude: number;
    // Waves per second (Hz)
    frequency: number;
}

export type SpreadShotData = {
    // Bullets per shot
    count: number;
    // Total spread of the fan (deg), 360 for a full circle
    angle: number;
    fireDelayMin: number;
    fireDelayMax: number;
}

// JSON can't hold 0x... numbers: the color is a hex string converted at init
export type EnemyBulletData = Omit<BulletData, 'color'> & {
    color: string;
}
