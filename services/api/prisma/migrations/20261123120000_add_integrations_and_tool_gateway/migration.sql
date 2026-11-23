-- CreateTable IntegrationConnection
CREATE TABLE `IntegrationConnection` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `externalAccountId` VARCHAR(191) NULL,
    `displayName` VARCHAR(191) NULL,
    `encryptedAccessToken` TEXT NOT NULL,
    `encryptedRefreshToken` TEXT NULL,
    `scopes` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IntegrationConnection_userId_provider_idx`(`userId`, `provider`),
    UNIQUE INDEX `IntegrationConnection_userId_provider_externalAccountId_key`(`userId`, `provider`, `externalAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable IntegrationState
CREATE TABLE `IntegrationState` (
    `id` VARCHAR(191) NOT NULL,
    `stateHash` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `redirectUri` VARCHAR(512) NOT NULL,
    `codeVerifierHash` VARCHAR(128) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `IntegrationState_stateHash_key`(`stateHash`),
    INDEX `IntegrationState_userId_provider_idx`(`userId`, `provider`),
    INDEX `IntegrationState_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ToolInvocation
CREATE TABLE `ToolInvocation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NULL,
    `conversationId` VARCHAR(191) NULL,
    `toolId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_APPROVAL',
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `approvalId` VARCHAR(191) NULL,
    `redactedInputSummary` TEXT NULL,
    `resultSummary` TEXT NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ToolInvocation_idempotencyKey_key`(`idempotencyKey`),
    INDEX `ToolInvocation_userId_toolId_idx`(`userId`, `toolId`),
    INDEX `ToolInvocation_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ToolApproval
CREATE TABLE `ToolApproval` (
    `id` VARCHAR(191) NOT NULL,
    `invocationId` VARCHAR(191) NOT NULL,
    `actionDigest` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approvedBy` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ToolApproval_invocationId_key`(`invocationId`),
    INDEX `ToolApproval_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `IntegrationConnection` ADD CONSTRAINT `IntegrationConnection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IntegrationState` ADD CONSTRAINT `IntegrationState_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ToolInvocation` ADD CONSTRAINT `ToolInvocation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ToolInvocation` ADD CONSTRAINT `ToolInvocation_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `IntegrationConnection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ToolApproval` ADD CONSTRAINT `ToolApproval_invocationId_fkey` FOREIGN KEY (`invocationId`) REFERENCES `ToolInvocation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
