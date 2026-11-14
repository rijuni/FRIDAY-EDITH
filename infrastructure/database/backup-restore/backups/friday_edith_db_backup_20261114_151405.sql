-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: localhost    Database: friday_edith_db
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `_prisma_migrations`
--

DROP TABLE IF EXISTS `_prisma_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `checksum` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logs` text COLLATE utf8mb4_unicode_ci,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `_prisma_migrations`
--

LOCK TABLES `_prisma_migrations` WRITE;
/*!40000 ALTER TABLE `_prisma_migrations` DISABLE KEYS */;
INSERT INTO `_prisma_migrations` VALUES ('bd1408c9-1a60-4a28-a63f-9e1f0c021e06','ca019e0708620e7e3fd51411708d20b16909777720defff0c350488dadf44f76','2026-11-13 12:03:45.992','20261113000000_init',NULL,NULL,'2026-11-13 12:03:43.633',1);
/*!40000 ALTER TABLE `_prisma_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `agenttask`
--

DROP TABLE IF EXISTS `agenttask`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agenttask` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `projectId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `prompt` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'QUEUED',
  `plan` longtext COLLATE utf8mb4_unicode_ci,
  `resultSummary` longtext COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `AgentTask_projectId_idx` (`projectId`),
  KEY `AgentTask_userId_idx` (`userId`),
  KEY `AgentTask_status_idx` (`status`),
  CONSTRAINT `AgentTask_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `workspaceproject` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AgentTask_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agenttask`
--

LOCK TABLES `agenttask` WRITE;
/*!40000 ALTER TABLE `agenttask` DISABLE KEYS */;
/*!40000 ALTER TABLE `agenttask` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attachment`
--

DROP TABLE IF EXISTS `attachment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attachment` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `conversationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `messageId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `filename` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mimeType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sizeBytes` int NOT NULL,
  `storagePath` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `parsedContent` longtext COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Attachment_conversationId_idx` (`conversationId`),
  KEY `Attachment_messageId_fkey` (`messageId`),
  CONSTRAINT `Attachment_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Attachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `message` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attachment`
--

LOCK TABLES `attachment` WRITE;
/*!40000 ALTER TABLE `attachment` DISABLE KEYS */;
/*!40000 ALTER TABLE `attachment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auditlog`
--

DROP TABLE IF EXISTS `auditlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditlog` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resourceType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resourceId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SUCCESS',
  `details` longtext COLLATE utf8mb4_unicode_ci,
  `ip` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `AuditLog_action_idx` (`action`),
  KEY `AuditLog_userId_idx` (`userId`),
  KEY `AuditLog_createdAt_idx` (`createdAt`),
  CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auditlog`
--

LOCK TABLES `auditlog` WRITE;
/*!40000 ALTER TABLE `auditlog` DISABLE KEYS */;
INSERT INTO `auditlog` VALUES ('cmwexifzn000413gl7gkwst1a','USER_REGISTERED',NULL,'USER','cmwexifwv000013glgm78lfwm','SUCCESS','{\"email\":\"edith_test_1794571458933@edith.corp\",\"role\":\"USER\"}',NULL,'2026-11-13 12:04:19.187'),('cmwexig3m00043e3lx78htaoj','USER_REGISTERED',NULL,'USER','cmwexig1n00003e3lrdpkaivx','SUCCESS','{\"email\":\"friday_owner_1794571459051@friday.corp\",\"role\":\"USER\"}',NULL,'2026-11-13 12:04:19.330'),('cmwexig7m000613glgk7r67b4','EDITH_COMMAND_DENIED',NULL,'RUNNER_COMMAND',NULL,'FAILURE','{\"commandHash\":\"5c7923bd67b06c93279d49c466301c57023822eec29c49e269063e47aecd973c\",\"commandLength\":8,\"riskScore\":100,\"reason\":\"Prohibited destructive operation\"}','127.0.0.1','2026-11-13 12:04:19.474'),('cmwexig8o000813glw0n79a0b','EDITH_COMMAND_APPROVAL_REQUIRED',NULL,'RUNNER_COMMAND',NULL,'FAILURE','{\"commandHash\":\"bd46e4f0daa9964e0d45aafa11e366457f0b1221142401395cac0940f1d9f513\",\"commandLength\":15,\"riskScore\":60}','127.0.0.1','2026-11-13 12:04:19.512'),('cmwexig8t00093e3lfuasyyzr','USER_REGISTERED',NULL,'USER','cmwexig7o00053e3lorm2qzwr','SUCCESS','{\"email\":\"friday_other_1794571459346@friday.corp\",\"role\":\"USER\"}',NULL,'2026-11-13 12:04:19.517'),('cmwexigal00041x2hg66wtxzb','USER_REGISTERED',NULL,'USER','cmwexig9g00001x2hpe4wx3sg','SUCCESS','{\"email\":\"tony_1794571458946@stark.corp\",\"role\":\"USER\"}','::1','2026-11-13 12:04:19.581'),('cmwexigay000a13glynpo11x0','EDITH_COMMAND_DISPATCHED',NULL,'RUNNER_COMMAND',NULL,'SUCCESS','{\"commandHash\":\"bd46e4f0daa9964e0d45aafa11e366457f0b1221142401395cac0940f1d9f513\",\"commandLength\":15,\"decision\":\"CONFIRMATION_REQUIRED\",\"approved\":true,\"runnerStatus\":200}','127.0.0.1','2026-11-13 12:04:19.594'),('cmwexigdc000e13glukoa2f25','EDITH_COMMAND_EXECUTION_FAILED',NULL,'RUNNER_COMMAND',NULL,'FAILURE','{\"commandHash\":\"328e123c63857fd8473bd4bd3581e655b08b7440d7f5d2c31cc375607582f539\",\"commandLength\":8,\"decision\":\"SAFE\",\"approved\":false,\"runnerStatus\":503,\"errorCode\":\"ISOLATED_EXECUTION_UNAVAILABLE\"}','127.0.0.1','2026-11-13 12:04:19.680'),('cmwexigev00081x2hu0adtpt4','USER_LOGIN_SUCCESS',NULL,'USER','cmwexig9g00001x2hpe4wx3sg','SUCCESS','{}','::1','2026-11-13 12:04:19.735'),('cmwexigh5000d1x2hw2jphavl','TOKEN_REFRESHED',NULL,'SESSION','cmwexigel00061x2hg65fukhn','SUCCESS','{}','::1','2026-11-13 12:04:19.818'),('cmwexighq000f1x2hmrdft41n','TOKEN_REFRESH_REPLAY_DETECTED',NULL,'SESSION','cmwexig9g00001x2hpe4wx3sg','FAILURE','{\"reason\":\"Refresh token not found in active sessions\"}','::1','2026-11-13 12:04:19.838'),('cmwexigij000h3e3lj2qka0fl','KNOWLEDGE_DOCUMENT_INGESTED',NULL,'KNOWLEDGE_BASE','cmwexiggv000d3e3ltkjs725v','SUCCESS','{\"filename\":\"notes.md\",\"chunkCount\":1,\"sizeBytes\":46}','::1','2026-11-13 12:04:19.867'),('cmwexigm5000l3e3lz1kpjq0z','USER_PROFILE_UPDATED',NULL,'USER','cmwexig1n00003e3lrdpkaivx','SUCCESS','{\"previousName\":\"Friday Owner\",\"newName\":\"Tony Updated\"}','::1','2026-11-13 12:04:19.997'),('cmwexigmw000k1x2hjfif20bi','USER_LOGIN_SUCCESS',NULL,'USER','cmwexigkd000g1x2hfvycwx8d','SUCCESS','{}','::1','2026-11-13 12:04:20.024'),('cmwexignc000n3e3lgvere94z','SUPPORT_REPORT_SUBMITTED',NULL,'SUPPORT_TICKET','SUP-MWEXIGNA','SUCCESS','{\"referenceId\":\"SUP-MWEXIGNA\",\"category\":\"bug\",\"subject\":\"Sample verification issue\",\"description\":\"Testing support ticket persistence in Prisma AuditLog.\",\"includeDiagnostics\":true,\"platformVersion\":\"2.1.0\"}','::1','2026-11-13 12:04:20.040'),('cmwexigny000m1x2hj5n4vb88','USER_ROLE_UPDATED',NULL,'USER','cmwexig9g00001x2hpe4wx3sg','SUCCESS','{\"previousRole\":\"USER\",\"newRole\":\"DEVELOPER\"}','::1','2026-11-13 12:04:20.062'),('cmwexigoq000r3e3lg70q79aq','ATTACHMENT_UPLOADED',NULL,'ATTACHMENT','cmwexigoe000p3e3lmzoj5zz0','SUCCESS','{\"conversationId\":\"cmwexigdl000b3e3l15ra30dx\",\"filename\":\"notes.md\",\"mimeType\":\"text/markdown\",\"sizeBytes\":28}','::1','2026-11-13 12:04:20.090'),('cmwexigou000o1x2heerwinb7','USER_ROLE_UPDATED',NULL,'USER','cmwexigkd000g1x2hfvycwx8d','SUCCESS','{\"previousRole\":\"ADMIN\",\"newRole\":\"USER\"}','::1','2026-11-13 12:04:20.094'),('cmwexigpw000q1x2h5lh4kikq','USER_LOGOUT',NULL,'SESSION','cmwexig9g00001x2hpe4wx3sg','SUCCESS','{}','::1','2026-11-13 12:04:20.133'),('cmwexigqg000s1x2hc9r95wec','TOKEN_REFRESH_REPLAY_DETECTED',NULL,'SESSION','cmwexig9g00001x2hpe4wx3sg','FAILURE','{\"reason\":\"Refresh token not found in active sessions\"}','::1','2026-11-13 12:04:20.152'),('cmwexisz50004k4auv2ucua79','USER_REGISTERED',NULL,'USER','cmwexisy30000k4auv0nh6j5q','SUCCESS','{\"email\":\"edith_test_1794571475896@edith.corp\",\"role\":\"USER\"}',NULL,'2026-11-13 12:04:36.017'),('cmwexiszl0004kepyt409tgbv','USER_REGISTERED',NULL,'USER','cmwexisyi0000kepyboykucr1','SUCCESS','{\"email\":\"friday_owner_1794571475906@friday.corp\",\"role\":\"USER\"}',NULL,'2026-11-13 12:04:36.033'),('cmwexit270009kepy648u98id','USER_REGISTERED',NULL,'USER','cmwexit1l0005kepyf2a6uj6x','SUCCESS','{\"email\":\"friday_other_1794571476043@friday.corp\",\"role\":\"USER\"}',NULL,'2026-11-13 12:04:36.127'),('cmwexit3g0006k4augfug3go1','EDITH_COMMAND_DENIED',NULL,'RUNNER_COMMAND',NULL,'FAILURE','{\"commandHash\":\"5c7923bd67b06c93279d49c466301c57023822eec29c49e269063e47aecd973c\",\"commandLength\":8,\"riskScore\":100,\"reason\":\"Prohibited destructive operation\"}','127.0.0.1','2026-11-13 12:04:36.172'),('cmwexit470008k4au9lbpyj8k','EDITH_COMMAND_APPROVAL_REQUIRED',NULL,'RUNNER_COMMAND',NULL,'FAILURE','{\"commandHash\":\"bd46e4f0daa9964e0d45aafa11e366457f0b1221142401395cac0940f1d9f513\",\"commandLength\":15,\"riskScore\":60}','127.0.0.1','2026-11-13 12:04:36.199'),('cmwexit58000ak4auetvmfspo','EDITH_COMMAND_DISPATCHED',NULL,'RUNNER_COMMAND',NULL,'SUCCESS','{\"commandHash\":\"bd46e4f0daa9964e0d45aafa11e366457f0b1221142401395cac0940f1d9f513\",\"commandLength\":15,\"decision\":\"CONFIRMATION_REQUIRED\",\"approved\":true,\"runnerStatus\":200}','127.0.0.1','2026-11-13 12:04:36.236'),('cmwexit600004rxiu57gev2fx','USER_REGISTERED',NULL,'USER','cmwexit500000rxiudpmqf4t4','SUCCESS','{\"email\":\"tony_1794571475909@stark.corp\",\"role\":\"USER\"}','::1','2026-11-13 12:04:36.264'),('cmwexit6y000ek4aupzfzgyj0','EDITH_COMMAND_EXECUTION_FAILED',NULL,'RUNNER_COMMAND',NULL,'FAILURE','{\"commandHash\":\"328e123c63857fd8473bd4bd3581e655b08b7440d7f5d2c31cc375607582f539\",\"commandLength\":8,\"decision\":\"SAFE\",\"approved\":false,\"runnerStatus\":503,\"errorCode\":\"ISOLATED_EXECUTION_UNAVAILABLE\"}','127.0.0.1','2026-11-13 12:04:36.298'),('cmwexit970008rxiuspv14hod','USER_LOGIN_SUCCESS',NULL,'USER','cmwexit500000rxiudpmqf4t4','SUCCESS','{}','::1','2026-11-13 12:04:36.379'),('cmwexit9j000hkepyjva2e94s','KNOWLEDGE_DOCUMENT_INGESTED',NULL,'KNOWLEDGE_BASE','cmwexit85000dkepypivs01ha','SUCCESS','{\"filename\":\"notes.md\",\"chunkCount\":1,\"sizeBytes\":46}','::1','2026-11-13 12:04:36.392'),('cmwexitat000drxiu251lrd2l','TOKEN_REFRESHED',NULL,'SESSION','cmwexit8y0006rxiu8no9o730','SUCCESS','{}','::1','2026-11-13 12:04:36.437'),('cmwexitbc000frxiu4itz3z03','TOKEN_REFRESH_REPLAY_DETECTED',NULL,'SESSION','cmwexit500000rxiudpmqf4t4','FAILURE','{\"reason\":\"Refresh token not found in active sessions\"}','::1','2026-11-13 12:04:36.456'),('cmwexitch000lkepycdaw3lhv','USER_PROFILE_UPDATED',NULL,'USER','cmwexisyi0000kepyboykucr1','SUCCESS','{\"previousName\":\"Friday Owner\",\"newName\":\"Tony Updated\"}','::1','2026-11-13 12:04:36.497'),('cmwexitdc000nkepyazv6z137','SUPPORT_REPORT_SUBMITTED',NULL,'SUPPORT_TICKET','SUP-MWEXITDA','SUCCESS','{\"referenceId\":\"SUP-MWEXITDA\",\"category\":\"bug\",\"subject\":\"Sample verification issue\",\"description\":\"Testing support ticket persistence in Prisma AuditLog.\",\"includeDiagnostics\":true,\"platformVersion\":\"2.1.0\"}','::1','2026-11-13 12:04:36.529'),('cmwexited000rkepya31egrjx','ATTACHMENT_UPLOADED',NULL,'ATTACHMENT','cmwexite4000pkepyr36kzb2u','SUCCESS','{\"conversationId\":\"cmwexit5h000bkepy4o2tubi4\",\"filename\":\"notes.md\",\"mimeType\":\"text/markdown\",\"sizeBytes\":28}','::1','2026-11-13 12:04:36.565'),('cmwexitf0000krxiuq3vwhtpm','USER_LOGIN_SUCCESS',NULL,'USER','cmwexitd7000grxiu0xrkw6xl','SUCCESS','{}','::1','2026-11-13 12:04:36.589'),('cmwexitfu000mrxiuhrkxyyr6','USER_ROLE_UPDATED',NULL,'USER','cmwexit500000rxiudpmqf4t4','SUCCESS','{\"previousRole\":\"USER\",\"newRole\":\"DEVELOPER\"}','::1','2026-11-13 12:04:36.618'),('cmwexitgn000orxiup2kx761d','USER_ROLE_UPDATED',NULL,'USER','cmwexitd7000grxiu0xrkw6xl','SUCCESS','{\"previousRole\":\"ADMIN\",\"newRole\":\"USER\"}','::1','2026-11-13 12:04:36.647'),('cmwexithe000qrxiuzio3v33m','USER_LOGOUT',NULL,'SESSION','cmwexit500000rxiudpmqf4t4','SUCCESS','{}','::1','2026-11-13 12:04:36.674'),('cmwexithr000srxiujwg5r8wh','TOKEN_REFRESH_REPLAY_DETECTED',NULL,'SESSION','cmwexit500000rxiudpmqf4t4','FAILURE','{\"reason\":\"Refresh token not found in active sessions\"}','::1','2026-11-13 12:04:36.688'),('cmwg7dp180004n6ywiti89c3v','USER_REGISTERED',NULL,'USER','cmwg7dozg0000n6yw8od4ktog','SUCCESS','{\"email\":\"edith_test_1794648499738@edith.corp\",\"role\":\"USER\"}',NULL,'2026-11-14 09:28:19.964'),('cmwg7dp1i0004zswcxbvf82ra','USER_REGISTERED',NULL,'USER','cmwg7dp010000zswc4gifrac7','SUCCESS','{\"email\":\"friday_owner_1794648499715@friday.corp\",\"role\":\"USER\"}',NULL,'2026-11-14 09:28:19.974'),('cmwg7dp5j0009zswcit0m5pes','USER_REGISTERED',NULL,'USER','cmwg7dp490005zswcyn2wlsw7','SUCCESS','{\"email\":\"friday_other_1794648499989@friday.corp\",\"role\":\"USER\"}',NULL,'2026-11-14 09:28:20.120'),('cmwg7dp710006n6yw2az2438u','EDITH_COMMAND_DENIED',NULL,'RUNNER_COMMAND',NULL,'FAILURE','{\"commandHash\":\"5c7923bd67b06c93279d49c466301c57023822eec29c49e269063e47aecd973c\",\"commandLength\":8,\"riskScore\":100,\"reason\":\"Prohibited destructive operation\"}','127.0.0.1','2026-11-14 09:28:20.173'),('cmwg7dp810008n6yw0yl7kr5w','EDITH_COMMAND_APPROVAL_REQUIRED',NULL,'RUNNER_COMMAND',NULL,'FAILURE','{\"commandHash\":\"bd46e4f0daa9964e0d45aafa11e366457f0b1221142401395cac0940f1d9f513\",\"commandLength\":15,\"riskScore\":60}','127.0.0.1','2026-11-14 09:28:20.209'),('cmwg7dp9b000an6ywsy24djpy','EDITH_COMMAND_DISPATCHED',NULL,'RUNNER_COMMAND',NULL,'SUCCESS','{\"commandHash\":\"bd46e4f0daa9964e0d45aafa11e366457f0b1221142401395cac0940f1d9f513\",\"commandLength\":15,\"decision\":\"CONFIRMATION_REQUIRED\",\"approved\":true,\"runnerStatus\":200}','127.0.0.1','2026-11-14 09:28:20.255'),('cmwg7dpaf0004l7ar169tnd2j','USER_REGISTERED',NULL,'USER','cmwg7dp8u0000l7arpmyr4o93','SUCCESS','{\"email\":\"tony_1794648499752@stark.corp\",\"role\":\"USER\"}','::1','2026-11-14 09:28:20.295'),('cmwg7dpcd000en6ywjhnqmzbc','EDITH_COMMAND_EXECUTION_FAILED',NULL,'RUNNER_COMMAND',NULL,'FAILURE','{\"commandHash\":\"328e123c63857fd8473bd4bd3581e655b08b7440d7f5d2c31cc375607582f539\",\"commandLength\":8,\"decision\":\"SAFE\",\"approved\":false,\"runnerStatus\":503,\"errorCode\":\"ISOLATED_EXECUTION_UNAVAILABLE\"}','127.0.0.1','2026-11-14 09:28:20.365'),('cmwg7dpfs0008l7argh3dmyp2','USER_LOGIN_SUCCESS',NULL,'USER','cmwg7dp8u0000l7arpmyr4o93','SUCCESS','{}','::1','2026-11-14 09:28:20.488'),('cmwg7dpgs000hzswcpo74f88x','KNOWLEDGE_DOCUMENT_INGESTED',NULL,'KNOWLEDGE_BASE','cmwg7dper000dzswczkbo8vwu','SUCCESS','{\"filename\":\"notes.md\",\"chunkCount\":1,\"sizeBytes\":46}','::1','2026-11-14 09:28:20.524'),('cmwg7dpjj000dl7ar3i7mc8rb','TOKEN_REFRESHED',NULL,'SESSION','cmwg7dpfh0006l7aru3ymq4yi','SUCCESS','{}','::1','2026-11-14 09:28:20.624'),('cmwg7dpkf000fl7argp5b6s82','TOKEN_REFRESH_REPLAY_DETECTED',NULL,'SESSION','cmwg7dp8u0000l7arpmyr4o93','FAILURE','{\"reason\":\"Refresh token not found in active sessions\"}','::1','2026-11-14 09:28:20.656'),('cmwg7dpme000lzswcs62stnqx','USER_PROFILE_UPDATED',NULL,'USER','cmwg7dp010000zswc4gifrac7','SUCCESS','{\"previousName\":\"Friday Owner\",\"newName\":\"Tony Updated\"}','::1','2026-11-14 09:28:20.726'),('cmwg7dpo4000nzswcvj3abuxt','SUPPORT_REPORT_SUBMITTED',NULL,'SUPPORT_TICKET','SUP-MWG7DPO2','SUCCESS','{\"referenceId\":\"SUP-MWG7DPO2\",\"category\":\"bug\",\"subject\":\"Sample verification issue\",\"description\":\"Testing support ticket persistence in Prisma AuditLog.\",\"includeDiagnostics\":true,\"platformVersion\":\"2.1.0\"}','::1','2026-11-14 09:28:20.788'),('cmwg7dpq5000rzswce2vbtg84','ATTACHMENT_UPLOADED',NULL,'ATTACHMENT','cmwg7dpps000pzswcst55tchq','SUCCESS','{\"conversationId\":\"cmwg7dpar000bzswcj09360eo\",\"filename\":\"notes.md\",\"mimeType\":\"text/markdown\",\"sizeBytes\":28}','::1','2026-11-14 09:28:20.861'),('cmwg7dpse000kl7arew1rc910','USER_LOGIN_SUCCESS',NULL,'USER','cmwg7dpov000gl7ar0ibjc1l1','SUCCESS','{}','::1','2026-11-14 09:28:20.942'),('cmwg7dpts000ml7ar3zrwvehn','USER_ROLE_UPDATED',NULL,'USER','cmwg7dp8u0000l7arpmyr4o93','SUCCESS','{\"previousRole\":\"USER\",\"newRole\":\"DEVELOPER\"}','::1','2026-11-14 09:28:20.992'),('cmwg7dpv3000ol7arjen3a0yj','USER_ROLE_UPDATED',NULL,'USER','cmwg7dpov000gl7ar0ibjc1l1','SUCCESS','{\"previousRole\":\"ADMIN\",\"newRole\":\"USER\"}','::1','2026-11-14 09:28:21.039'),('cmwg7dpwc000ql7aral1cik9h','USER_LOGOUT',NULL,'SESSION','cmwg7dp8u0000l7arpmyr4o93','SUCCESS','{}','::1','2026-11-14 09:28:21.084'),('cmwg7dpwy000sl7arba4l7o2c','TOKEN_REFRESH_REPLAY_DETECTED',NULL,'SESSION','cmwg7dp8u0000l7arpmyr4o93','FAILURE','{\"reason\":\"Refresh token not found in active sessions\"}','::1','2026-11-14 09:28:21.107');
/*!40000 ALTER TABLE `auditlog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `checkpoint`
--

DROP TABLE IF EXISTS `checkpoint`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `checkpoint` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `taskId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `snapshotHash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `filesChanged` longtext COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Checkpoint_taskId_idx` (`taskId`),
  CONSTRAINT `Checkpoint_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `agenttask` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `checkpoint`
--

LOCK TABLES `checkpoint` WRITE;
/*!40000 ALTER TABLE `checkpoint` DISABLE KEYS */;
/*!40000 ALTER TABLE `checkpoint` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `commandapproval`
--

DROP TABLE IF EXISTS `commandapproval`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commandapproval` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `taskId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `command` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `riskTier` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `approvedByUserId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `CommandApproval_taskId_idx` (`taskId`),
  KEY `CommandApproval_status_idx` (`status`),
  CONSTRAINT `CommandApproval_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `agenttask` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `commandapproval`
--

LOCK TABLES `commandapproval` WRITE;
/*!40000 ALTER TABLE `commandapproval` DISABLE KEYS */;
/*!40000 ALTER TABLE `commandapproval` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversation`
--

DROP TABLE IF EXISTS `conversation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversation` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'New Conversation',
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `projectId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isPinned` tinyint(1) NOT NULL DEFAULT '0',
  `isArchived` tinyint(1) NOT NULL DEFAULT '0',
  `modelPreference` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `systemPrompt` longtext COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `Conversation_userId_idx` (`userId`),
  KEY `Conversation_updatedAt_idx` (`updatedAt`),
  CONSTRAINT `Conversation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversation`
--

LOCK TABLES `conversation` WRITE;
/*!40000 ALTER TABLE `conversation` DISABLE KEYS */;
INSERT INTO `conversation` VALUES ('cmwexi5lv000312fn5alolf8l','Welcome to F.R.I.D.A.Y.','cmwexi5lk000112fn5jrxp240',NULL,0,0,'claude-3-7-sonnet','You are F.R.I.D.A.Y., a high-intelligence AI assistant running on Nebula UI.','2026-11-13 12:04:05.731','2026-11-13 12:04:05.731');
/*!40000 ALTER TABLE `conversation` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `documentchunk`
--

DROP TABLE IF EXISTS `documentchunk`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `documentchunk` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `knowledgeBaseId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenCount` int NOT NULL DEFAULT '0',
  `chunkIndex` int NOT NULL DEFAULT '0',
  `metadata` longtext COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `DocumentChunk_knowledgeBaseId_idx` (`knowledgeBaseId`),
  CONSTRAINT `DocumentChunk_knowledgeBaseId_fkey` FOREIGN KEY (`knowledgeBaseId`) REFERENCES `knowledgebase` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `documentchunk`
--

LOCK TABLES `documentchunk` WRITE;
/*!40000 ALTER TABLE `documentchunk` DISABLE KEYS */;
/*!40000 ALTER TABLE `documentchunk` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `knowledgebase`
--

DROP TABLE IF EXISTS `knowledgebase`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledgebase` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `KnowledgeBase_userId_idx` (`userId`),
  CONSTRAINT `KnowledgeBase_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `knowledgebase`
--

LOCK TABLES `knowledgebase` WRITE;
/*!40000 ALTER TABLE `knowledgebase` DISABLE KEYS */;
/*!40000 ALTER TABLE `knowledgebase` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `memoryitem`
--

DROP TABLE IF EXISTS `memoryitem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `memoryitem` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `confidence` double NOT NULL DEFAULT '1',
  `sourceConversationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `MemoryItem_userId_idx` (`userId`),
  KEY `MemoryItem_category_idx` (`category`),
  CONSTRAINT `MemoryItem_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `memoryitem`
--

LOCK TABLES `memoryitem` WRITE;
/*!40000 ALTER TABLE `memoryitem` DISABLE KEYS */;
/*!40000 ALTER TABLE `memoryitem` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `message`
--

DROP TABLE IF EXISTS `message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `message` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `conversationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `reasoningContent` longtext COLLATE utf8mb4_unicode_ci,
  `metadata` longtext COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Message_conversationId_idx` (`conversationId`),
  CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `message`
--

LOCK TABLES `message` WRITE;
/*!40000 ALTER TABLE `message` DISABLE KEYS */;
INSERT INTO `message` VALUES ('cmwexi5lv000412fnmwitg8yp','cmwexi5lv000312fn5alolf8l','assistant','Greetings. F.R.I.D.A.Y. systems are online. How may I assist your intelligence operations today?',NULL,NULL,'2026-11-13 12:04:05.731');
/*!40000 ALTER TABLE `message` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `providerkey`
--

DROP TABLE IF EXISTS `providerkey`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `providerkey` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `encryptedKey` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `isDefault` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ProviderKey_userId_provider_key` (`userId`,`provider`),
  CONSTRAINT `ProviderKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `providerkey`
--

LOCK TABLES `providerkey` WRITE;
/*!40000 ALTER TABLE `providerkey` DISABLE KEYS */;
/*!40000 ALTER TABLE `providerkey` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `session`
--

DROP TABLE IF EXISTS `session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenHash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userAgent` text COLLATE utf8mb4_unicode_ci,
  `ipAddress` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Session_tokenHash_key` (`tokenHash`),
  KEY `Session_userId_idx` (`userId`),
  CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `session`
--

LOCK TABLES `session` WRITE;
/*!40000 ALTER TABLE `session` DISABLE KEYS */;
/*!40000 ALTER TABLE `session` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `passwordHash` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USER',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_email_key` (`email`),
  KEY `User_email_idx` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user`
--

LOCK TABLES `user` WRITE;
/*!40000 ALTER TABLE `user` DISABLE KEYS */;
INSERT INTO `user` VALUES ('cmwexi5jz000012fnnfn8g7mr','admin@friday-edith.internal','System Administrator','$argon2id$v=19$m=19456,t=2,p=1$hjdiPJEb6eWPefjjNJxXGg$a9bjfjrRpiXHljCgfNlNduq1Sh5uull95DmbgNRdtcs','ADMIN',1,'2026-11-13 12:04:05.663','2026-11-13 12:04:05.663'),('cmwexi5lk000112fn5jrxp240','dev@friday-edith.internal','Lead Engineer','$argon2id$v=19$m=19456,t=2,p=1$jlXLNQD/z4RJ8gD94D5aMQ$wzW0muETxLEBZAh2R1tax5l059zHRS4trmoskztpK1Q','DEVELOPER',1,'2026-11-13 12:04:05.720','2026-11-13 12:04:05.720');
/*!40000 ALTER TABLE `user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workspaceproject`
--

DROP TABLE IF EXISTS `workspaceproject`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workspaceproject` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `repoUrl` text COLLATE utf8mb4_unicode_ci,
  `localPath` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `defaultBranch` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'main',
  `settings` longtext COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `WorkspaceProject_userId_idx` (`userId`),
  CONSTRAINT `WorkspaceProject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workspaceproject`
--

LOCK TABLES `workspaceproject` WRITE;
/*!40000 ALTER TABLE `workspaceproject` DISABLE KEYS */;
INSERT INTO `workspaceproject` VALUES ('cmwexi5ma000612fn5ivri48s','cmwexi5lk000112fn5jrxp240','Friday-Edith Core Platform','https://github.com/rijuni/FRIDAY-EDITH.git','M:\\Friday-Edith','main','{\"isolatedRunner\":true,\"autoApproveReadOnly\":true}','2026-11-13 12:04:05.747','2026-11-13 12:04:05.747');
/*!40000 ALTER TABLE `workspaceproject` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'friday_edith_db'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-14 15:14:06
