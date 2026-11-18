CREATE INDEX `Conversation_projectId_idx` ON `Conversation`(`projectId`);

ALTER TABLE `Conversation`
ADD CONSTRAINT `Conversation_projectId_fkey`
FOREIGN KEY (`projectId`) REFERENCES `WorkspaceProject`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;
