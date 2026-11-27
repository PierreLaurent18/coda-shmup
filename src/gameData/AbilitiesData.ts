export type AbilitiesData = {
    laser: LaserData;
    powerUps: PowerUpsData;
}

export type LaserData = {
    // Time (ms) holding the key to reach a full charge
    chargeTime: number;
    // Charge ratio (0-1) under which releasing the key does nothing
    minCharge: number;
    // Damage at full charge, scaled down with the charge
    maxDamage: number;
    // Beam length (px)
    length: number;
    // Beam width (px) at minimum and full charge
    minWidth: number;
    maxWidth: number;
    // Hex string, e.g. "#66e0ff"
    color: string;
    // How long the beam stays visible (ms)
    duration: number;
}

export type PowerUpType = 'multiShot' | 'shield' | 'speed';

export type PowerUpsData = {
    // Chance (0-1) for a regular enemy to drop a power-up when it dies
    dropChance: number;
    // A boss always drops this many power-ups
    bossDropCount: number;
    // Time (ms) a power-up stays on the ground
    lifetime: number;
    multiShot: MultiShotPowerUpData;
    shield: PowerUpData;
    speed: SpeedPowerUpData;
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

export type SpeedPowerUpData = PowerUpData & {
    multiplier: number;
}
