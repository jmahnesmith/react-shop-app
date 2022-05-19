const express = require('express');
const router = express.Router();
const { User } = require("../models/User");
const { Product } = require('../models/Product');
const { auth } = require("../middleware/auth");
const { Payment } = require('../models/Payment');
const async = require('async');
const { v4: uuidv4 } = require('uuid');

const storeController = require('../controllers/storeController')

// Store

router.get('/addToCart', auth, async (req, res) => {
    const userId = req.user._id;
    const productId = req.query.productId

    try {
        const userUpdated = await storeController.addProductToCart(userId, productId);
        return res.status(200).json(userUpdated.cart)
    } catch (err) {
        return res.json({ success: false, err })
    }
});

router.get('/removeFromCart', auth, async (req, res) => {
    const userId = req.user._id;
    const itemIdToRemove = req.query._id;

    try {
        const r = await storeController.removeFromCart(userId, itemIdToRemove);
        return res.status(200).json(r)
    } catch(err) {
        return res.json({ success: false, err })
    }   
})

router.get('/userCartInfo', auth, (req, res) => {
    User.findOne(
        { _id: req.user._id },
        (err, userInfo) => {
            let cart = userInfo.cart;
            let array = cart.map(item => {
                return item.id
            })


            Product.find({ '_id': { $in: array } })
                .populate('writer')
                .exec((err, cartDetail) => {
                    if (err) return res.status(400).send(err);
                    return res.status(200).json({ success: true, cartDetail, cart })
                })

        }
    )
})

router.post('/successBuy', auth, (req, res) => {
    console.log('successful buy')
    let history = [];
    let transactionData = {};

    // 1. WE SHOULD DO THE PAYMENT HERE

    // And we get back a payment id
    const paymentId = uuidv4();

    req.body.cartDetail.forEach((item) => {
        console.log(item);
        console.log(paymentId)

        history.push({
            dateOfPurchase: Date.now(),
            name: item.title,
            id: item._id,
            price: item.price,
            quantity: item.quantity,
            paymentId: paymentId
        })
    })

    // 2.Put Payment Information that come from payment into Payment Collection 
    transactionData.user = {
        id: req.user._id,
        name: req.user.name,
        lastname: req.user.lastname,
        email: req.user.email
    }

    transactionData.data = paymentId;
    transactionData.product = history


    User.findOneAndUpdate(
        { _id: req.user._id },
        { $push: { history: history }, $set: { cart: [] } },
        { new: true },
        (err, user) => {
            if (err) return res.json({ success: false, err });


            const payment = new Payment(transactionData)
            payment.save((err, doc) => {
                if (err) return res.json({ success: false, err });

                //3. Increase the amount of number for the sold information 

                //first We need to know how many product were sold in this transaction for 
                // each of products

                let products = [];
                doc.product.forEach(item => {
                    products.push({ id: item.id, quantity: item.quantity })
                })

                // first Item    quantity 2
                // second Item  quantity 3

                async.eachSeries(products, (item, callback) => {
                    Product.update(
                        { _id: item.id },
                        {
                            $inc: {
                                "sold": item.quantity
                            }
                        },
                        { new: false },
                        callback
                    )
                }, (err) => {
                    if (err) return res.json({ success: false, err })
                    res.status(200).json({
                        success: true,
                        cart: user.cart,
                        cartDetail: []
                    })
                })

            })
        }
    )
})

router.get('/getHistory', auth, (req, res) => {
    User.findOne(
        { _id: req.user._id },
        (err, doc) => {
            let history = doc.history;
            if (err) return res.status(400).send(err)
            return res.status(200).json({ success: true, history })
        }
    )
})

module.exports = router;
