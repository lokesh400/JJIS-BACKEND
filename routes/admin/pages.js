const express = require("express");
const { auth, adminOnly } = require("../../middleware/auth");
const Test = require("../../models/Test");

const router = express.Router();

router.get("/admin/dashboard", (req, res) =>
  res.render("admin/dashboard", { title: "Admin Dashboard" }),
);
router.get("/admin/question-bank", (req, res) =>
  res.render("admin/question-bank", { title: "Question Bank" }),
);
router.get("/admin/upload", (req, res) =>
  res.render("admin/question-upload", { title: "Upload Questions" }),
);
router.get("/admin/tests", (req, res) =>
  res.render("admin/test-list", { title: "Tests" }),
);
router.get("/admin/tests/:testId", (req, res) =>
  res.render("admin/test-creator", { title: "Test Creator" }),
);
router.get("/admin/jee-advanced-tests/:testId", (req, res) =>
  res.render("admin/jee-advanced-creator", { title: "JEE Advanced Creator" }),
);
router.get("/admin/tests/:testId/results", (req, res) =>
  res.render("admin/test-results", { title: "Test Results" }),
);
router.get("/admin/tests/:testId/download-pdf", auth, adminOnly, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId)
      .populate({
        path: 'sections.questions.question',
        populate: [
          { path: 'subject', select: 'name' },
          { path: 'chapter', select: 'name' },
          { path: 'topic', select: 'name' },
        ],
      })
      .lean();

    if (!test) {
      return res.status(404).render("404", { title: "Test Not Found" });
    }

    res.render("admin/test-pdf-preview", { 
      title: "Print Test PDF", 
      testData: JSON.stringify(test)
    });
  } catch (error) {
    res.status(500).render("404", { title: "Error" });
  }
});

router.get("/admin/test-series", (req, res) =>
  res.render("admin/test-series-list", { title: "Test Series" }),
);
router.get("/admin/test-series/:seriesId/enrolled", (req, res) =>
  res.render("admin/test-series-enrolled", { title: "Enrolled Users" }),
);
router.get("/admin/test-series/:seriesId", (req, res) =>
  res.render("admin/test-series-manager", { title: "Manage Series" }),
);
router.get("/admin/reports", (req, res) =>
  res.render("admin/reports", { title: "Question Reports" }),
);
router.get("/admin/battleground", (req, res) =>
  res.render("admin/battleground", { title: "Battleground" }),
);

module.exports = router;
