export type PowerUpType = 'multiShot' | 'shield' | 'speed' | 'rapidFire';

export type PowerUpsData = {
    // Chance (0-1) for a regular enemy to drop a power-up when it dies
    dropChance: number;
    // A boss always drops this many power-ups
    bossDropCount: number;
    // Falling speed of a dropped power-up (px/ms)
    fallSpeed: number;
    multiShot: MultiShotPowerUpData;
    shield: PowerUpData;
    speed: MultiplierPowerUpData;
    rapidFire: MultiplierPowerUpData;
}

export type PowerUpData = {
    // Frame in the 'sprites' atlas
    frame: string;
    // Hex string, e.g. "#ffe066"
    tint: string;
    // Text shown when picked up
    label: string;
    // Effect duration (ms)
    duration: number;
}

export type MultiShotPowerUpData = PowerUpData & {
    count: number;
    // Total spread (deg)
    angle: number;
}

// speed: movement speed multiplier, rapidFire: fire rate multiplier
export type MultiplierPowerUpData = PowerUpData & {
    multiplier: number;
}
