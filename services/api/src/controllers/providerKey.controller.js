import { providerKeyService } from '../modules/secrets/providerKey.service.js';

export async function listKeys(req, res, next) {
  try {
    const keys = await providerKeyService.listUserKeys({ userId: req.user.id });
    res.status(200).json({
      status: 'success',
      data: { keys }
    });
  } catch (error) {
    next(error);
  }
}

export async function setKey(req, res, next) {
  try {
    const { provider, apiKey, isDefault } = req.body;
    const key = await providerKeyService.setProviderKey({
      userId: req.user.id,
      provider,
      apiKey,
      isDefault,
      ip: req.ip
    });

    res.status(201).json({
      status: 'success',
      data: { key }
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteKey(req, res, next) {
  try {
    const { provider } = req.params;
    await providerKeyService.deleteProviderKey({
      userId: req.user.id,
      provider,
      ip: req.ip
    });

    res.status(200).json({
      status: 'success',
      message: `Provider key for '${provider}' deleted successfully`
    });
  } catch (error) {
    next(error);
  }
}
