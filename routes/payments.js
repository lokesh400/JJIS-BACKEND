const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const TestSeries = require('../models/TestSeries');
const Course = require('../models/Course');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Setup Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

function resolvePurchasePayload(body = {}) {
  if (body.seriesId) {
    return { itemType: 'TestSeries', itemId: body.seriesId };
  }

  if (body.courseId) {
    return { itemType: 'Course', itemId: body.courseId };
  }

  if (body.itemType && body.itemId) {
    return { itemType: body.itemType, itemId: body.itemId };
  }

  return { itemType: null, itemId: null };
}

async function getItemByType(itemType, itemId) {
  if (itemType === 'TestSeries') return TestSeries.findById(itemId);
  if (itemType === 'Course') return Course.findById(itemId);
  return null;
}

async function syncOwnership(itemType, itemId, userId) {
  if (itemType === 'TestSeries') {
    await Promise.all([
      TestSeries.findByIdAndUpdate(itemId, { $addToSet: { purchasedBy: userId } }, { new: true }),
      User.findByIdAndUpdate(userId, { $addToSet: { purchasedSeries: itemId } }, { new: true }),
    ]);
    return;
  }

  if (itemType === 'Course') {
    await Promise.all([
      Course.findByIdAndUpdate(itemId, { $addToSet: { purchasedBy: userId } }, { new: true }),
      User.findByIdAndUpdate(userId, { $addToSet: { purchasedCourses: itemId } }, { new: true }),
    ]);
  }
}

// Create order for paid purchase
router.post('/create-order', auth, async (req, res) => {
  try {
    console.log('[CREATE ORDER] Body:', req.body, 'User:', req.user?._id);
    const { itemType, itemId } = resolvePurchasePayload(req.body);
    if (!itemType || !itemId) {
      return res.status(400).json({ message: 'itemType and itemId are required' });
    }

    const item = await getItemByType(itemType, itemId);
    if (!item) {
      return res.status(404).json({ message: `${itemType} not found` });
    }
    if (item.price === 0) {
      return res.status(400).json({ message: `${itemType} is free` });
    }

    const existing = await Purchase.findOne({
      user: req.user._id,
      itemType,
      itemId,
      status: 'success',
    });
    if (existing) {
      return res.status(400).json({ message: 'Item already purchased' });
    }

    // Razorpay receipt must be <= 40 chars
    const shortReceipt = `${itemType.toLowerCase()}_${itemId}`.slice(0, 30) + `_${Date.now()}`.slice(0, 10);
    const order = await razorpay.orders.create({
      amount: item.price * 100, // INR paise
      currency: 'INR',
      receipt: shortReceipt,
      payment_capture: 1,
    });
    console.log('[CREATE ORDER] Order created:', order);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('[CREATE ORDER] Error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Verify payment and grant access
router.post('/verify', auth, async (req, res) => {
  try {
    console.log('[VERIFY] Body:', req.body, 'User:', req.user?._id);
    const { paymentId, orderId, signature } = req.body;
    const { itemType, itemId } = resolvePurchasePayload(req.body);
    if (!itemType || !itemId) {
      return res.status(400).json({ message: 'itemType and itemId are required' });
    }

    // Verify Razorpay payment signature
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ message: 'Missing payment verification parameters' });
    }
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    if (expectedSignature !== signature) {
      console.log('[VERIFY] Signature mismatch');
      return res.status(400).json({ message: 'Payment verification failed: invalid signature' });
    }

    const item = await getItemByType(itemType, itemId);
    if (!item) {
      return res.status(404).json({ message: `${itemType} not found` });
    }
    if (item.price === 0) {
      return res.status(400).json({ message: `${itemType} is free` });
    }

    // Security check: Prevent payment replay attacks (sharing payment IDs)
    const paymentUsed = await Purchase.findOne({ razorpayPaymentId: paymentId, status: 'success' });
    if (paymentUsed && String(paymentUsed.user) !== String(req.user._id)) {
      console.warn(`[SECURITY] Payment replay attempt! Payment ${paymentId} used by user ${paymentUsed.user}, attempted by ${req.user._id}`);
      return res.status(403).json({ message: 'Payment verification failed: payment already consumed' });
    }

    const existing = await Purchase.findOne({ user: req.user._id, itemType, itemId, status: 'success' });
    if (existing) {
      return res.status(200).json({ success: true, purchaseId: existing._id, alreadyPurchased: true });
    }

    const purchase = await Purchase.create({
      user:               req.user._id,
      itemType,
      itemId,
      amount:             item.price,
      method:             'online',
      status:             'success',
      razorpayOrderId:    orderId,
      razorpayPaymentId:  paymentId,
      razorpaySignature:  signature,
    });
    await syncOwnership(itemType, itemId, req.user._id);
    console.log('[VERIFY] Purchase created:', purchase._id);
    res.json({ success: true, purchaseId: purchase._id });
  } catch (error) {
    console.error('[VERIFY] Error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Free access route
router.post('/free-access', auth, async (req, res) => {
  try {
    console.log('[FREE ACCESS] Body:', req.body, 'User:', req.user?._id);
    const { itemType, itemId } = resolvePurchasePayload(req.body);
    if (!itemType || !itemId) {
      return res.status(400).json({ message: 'itemType and itemId are required' });
    }

    const item = await getItemByType(itemType, itemId);
    if (!item) {
      return res.status(404).json({ message: `${itemType} not found` });
    }
    if (item.price !== 0) {
      return res.status(400).json({ message: `${itemType} is not free` });
    }

    const existing = await Purchase.findOne({ user: req.user._id, itemType, itemId, status: 'success' });
    if (existing) {
      return res.status(200).json({ success: true, purchaseId: existing._id, alreadyPurchased: true });
    }

    const purchase = await Purchase.create({
      user:      req.user._id,
      itemType,
      itemId,
      amount:    0,
      method:    'free',
      status:    'success',
    });
    await syncOwnership(itemType, itemId, req.user._id);
    console.log('[FREE ACCESS] Purchase created:', purchase._id);
    res.json({ success: true, purchaseId: purchase._id });
  } catch (error) {
    console.error('[FREE ACCESS] Error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
