var fitCurve = (function () {
  var module = { exports: {} };
  var exports = module.exports;
  (function (global, factory) {
      if (typeof define === "function" && define.amd) {
          define(["module"], factory);
      } else if (typeof exports !== "undefined") {
          factory(module);
      } else {
          var mod = {
              exports: {}
          };
          factory(mod);
          global.fitCurve = mod.exports;
      }
  })(this, function (module) {
      "use strict";

      function _classCallCheck(instance, Constructor) {
          if (!(instance instanceof Constructor)) {
              throw new TypeError("Cannot call a class as a function");
          }
      }

      /**
       *  @preserve  JavaScript implementation of
       *  Algorithm for Automatically Fitting Digitized Curves
       *  by Philip J. Schneider
       *  "Graphics Gems", Academic Press, 1990
       *
       *  The MIT License (MIT)
       *
       *  https://github.com/soswow/fit-curves
       */

      /**
       * Fit one or more Bezier curves to a set of points.
       *
       * @param {Array<Array<Number>>} points - Array of digitized points, e.g. [[5,5],[5,50],[110,140],[210,160],[320,110]]
       * @param {Number} maxError - Tolerance, squared error between points and fitted curve
       * @returns {Array<Array<Array<Number>>>} Array of Bezier curves, where each element is [first-point, control-point-1, control-point-2, second-point] and points are [x, y]
       */
      function fitCurve(points, maxError, progressCallback) {
          if (!Array.isArray(points)) {
              throw new TypeError("First argument should be an array");
          }
          points.forEach(function (point) {
              if (!Array.isArray(point) || point.some(function (item) {
                  return typeof item !== 'number';
              }) || point.length !== points[0].length) {
                  throw Error("Each point should be an array of numbers. Each point should have the same amount of numbers.");
              }
          });

          // Remove duplicate points
          points = points.filter(function (point, i) {
              return i === 0 || !point.every(function (val, j) {
                  return val === points[i - 1][j];
              });
          });

          if (points.length < 2) {
              return [];
          }

          var len = points.length;
          var leftTangent = createTangent(points[1], points[0]);
          var rightTangent = createTangent(points[len - 2], points[len - 1]);

          return fitCubic(points, leftTangent, rightTangent, maxError, progressCallback);
      }

      /**
       * Fit a Bezier curve to a (sub)set of digitized points.
       * Your code should not call this function directly. Use {@link fitCurve} instead.
       *
       * @param {Array<Array<Number>>} points - Array of digitized points, e.g. [[5,5],[5,50],[110,140],[210,160],[320,110]]
       * @param {Array<Number>} leftTangent - Unit tangent vector at start point
       * @param {Array<Number>} rightTangent - Unit tangent vector at end point
       * @param {Number} error - Tolerance, squared error between points and fitted curve
       * @returns {Array<Array<Array<Number>>>} Array of Bezier curves, where each element is [first-point, control-point-1, control-point-2, second-point] and points are [x, y]
       */
      function fitCubic(points, leftTangent, rightTangent, error, progressCallback) {
          var MaxIterations = 20; //Max times to try iterating (to find an acceptable curve)

          var bezCurve, //Control points of fitted Bezier curve
          u, //Parameter values for point
          uPrime, //Improved parameter values
          maxError, prevErr, //Maximum fitting error
          splitPoint, prevSplit, //Point to split point set at if we need more than one curve
          centerVector, toCenterTangent, fromCenterTangent, //Unit tangent vector(s) at splitPoint
          beziers, //Array of fitted Bezier curves if we need more than one curve
          dist, i;

          //console.log('fitCubic, ', points.length);

          //Use heuristic if region only has two points in it
          if (points.length === 2) {
              dist = maths.vectorLen(maths.subtract(points[0], points[1])) / 3.0;
              bezCurve = [points[0], maths.addArrays(points[0], maths.mulItems(leftTangent, dist)), maths.addArrays(points[1], maths.mulItems(rightTangent, dist)), points[1]];
              return [bezCurve];
          }

          //Parameterize points, and attempt to fit curve
          u = chordLengthParameterize(points);

          var _generateAndReport = generateAndReport(points, u, u, leftTangent, rightTangent, progressCallback);

          bezCurve = _generateAndReport[0];
          maxError = _generateAndReport[1];
          splitPoint = _generateAndReport[2];


          if (maxError === 0 || maxError < error) {
              return [bezCurve];
          }
          //If error not too large, try some reparameterization and iteration
          if (maxError < error * error) {

              uPrime = u;
              prevErr = maxError;
              prevSplit = splitPoint;

              for (i = 0; i < MaxIterations; i++) {

                  uPrime = reparameterize(bezCurve, points, uPrime);

                  var _generateAndReport2 = generateAndReport(points, u, uPrime, leftTangent, rightTangent, progressCallback);

                  bezCurve = _generateAndReport2[0];
                  maxError = _generateAndReport2[1];
                  splitPoint = _generateAndReport2[2];


                  if (maxError < error) {
                      return [bezCurve];
                  }
                  //If the development of the fitted curve grinds to a halt,
                  //we abort this attempt (and try a shorter curve):
                  else if (splitPoint === prevSplit) {
                          var errChange = maxError / prevErr;
                          if (errChange > .9999 && errChange < 1.0001) {
                              break;
                          }
                      }

                  prevErr = maxError;
                  prevSplit = splitPoint;
              }
          }

          //Fitting failed -- split at max error point and fit recursively
          beziers = [];

          //To create a smooth transition from one curve segment to the next, we
          //calculate the line between the points directly before and after the
          //center, and use that as the tangent both to and from the center point.
          centerVector = maths.subtract(points[splitPoint - 1], points[splitPoint + 1]);
          //However, this won't work if they're the same point, because the line we
          //want to use as a tangent would be 0. Instead, we calculate the line from
          //that "double-point" to the center point, and use its tangent.
          if (centerVector.every(function (val) {
              return val === 0;
          })) {
              //[x,y] -> [-y,x]: http://stackoverflow.com/a/4780141/1869660
              centerVector = maths.subtract(points[splitPoint - 1], points[splitPoint]);
              var _ref = [-centerVector[1], centerVector[0]];
              centerVector[0] = _ref[0];
              centerVector[1] = _ref[1];
          }
          toCenterTangent = maths.normalize(centerVector);
          //To and from need to point in opposite directions:
          fromCenterTangent = maths.mulItems(toCenterTangent, -1);

          /*
          Note: An alternative to this "divide and conquer" recursion could be to always
                let new curve segments start by trying to go all the way to the end,
                instead of only to the end of the current subdivided polyline.
                That might let many segments fit a few points more, reducing the number of total segments.
                 However, a few tests have shown that the segment reduction is insignificant
                (240 pts, 100 err: 25 curves vs 27 curves. 140 pts, 100 err: 17 curves on both),
                and the results take twice as many steps and milliseconds to finish,
                without looking any better than what we already have.
          */
          beziers = beziers.concat(fitCubic(points.slice(0, splitPoint + 1), leftTangent, toCenterTangent, error, progressCallback));
          beziers = beziers.concat(fitCubic(points.slice(splitPoint), fromCenterTangent, rightTangent, error, progressCallback));
          return beziers;
      };

      function generateAndReport(points, paramsOrig, paramsPrime, leftTangent, rightTangent, progressCallback) {
          var bezCurve, maxError, splitPoint;

          bezCurve = generateBezier(points, paramsPrime, leftTangent, rightTangent, progressCallback);
          //Find max deviation of points to fitted curve.
          //Here we always use the original parameters (from chordLengthParameterize()),
          //because we need to compare the current curve to the actual source polyline,
          //and not the currently iterated parameters which reparameterize() & generateBezier() use,
          //as those have probably drifted far away and may no longer be in ascending order.

          var _computeMaxError = computeMaxError(points, bezCurve, paramsOrig);

          maxError = _computeMaxError[0];
          splitPoint = _computeMaxError[1];


          if (progressCallback) {
              progressCallback({
                  bez: bezCurve,
                  points: points,
                  params: paramsOrig,
                  maxErr: maxError,
                  maxPoint: splitPoint
              });
          }

          return [bezCurve, maxError, splitPoint];
      }

      /**
       * Use least-squares method to find Bezier control points for region.
       *
       * @param {Array<Array<Number>>} points - Array of digitized points
       * @param {Array<Number>} parameters - Parameter values for region
       * @param {Array<Number>} leftTangent - Unit tangent vector at start point
       * @param {Array<Number>} rightTangent - Unit tangent vector at end point
       * @returns {Array<Array<Number>>} Approximated Bezier curve: [first-point, control-point-1, control-point-2, second-point] where points are [x, y]
       */
      function generateBezier(points, parameters, leftTangent, rightTangent) {
          var bezCurve,
              //Bezier curve ctl pts
          A,
              a,
              //Precomputed rhs for eqn
          C,
              X,
              //Matrices C & X
          det_C0_C1,
              det_C0_X,
              det_X_C1,
              //Determinants of matrices
          alpha_l,
              alpha_r,
              //Alpha values, left and right

          epsilon,
              segLength,
              i,
              len,
              tmp,
              u,
              ux,
              firstPoint = points[0],
              lastPoint = points[points.length - 1];

          bezCurve = [firstPoint, null, null, lastPoint];
          //console.log('gb', parameters.length);

          //Compute the A's
          A = maths.zeros_Xx2x2(parameters.length);
          for (i = 0, len = parameters.length; i < len; i++) {
              u = parameters[i];
              ux = 1 - u;
              a = A[i];

              a[0] = maths.mulItems(leftTangent, 3 * u * (ux * ux));
              a[1] = maths.mulItems(rightTangent, 3 * ux * (u * u));
          }

          //Create the C and X matrices
          C = [[0, 0], [0, 0]];
          X = [0, 0];
          for (i = 0, len = points.length; i < len; i++) {
              u = parameters[i];
              a = A[i];

              C[0][0] += maths.dot(a[0], a[0]);
              C[0][1] += maths.dot(a[0], a[1]);
              C[1][0] += maths.dot(a[0], a[1]);
              C[1][1] += maths.dot(a[1], a[1]);

              tmp = maths.subtract(points[i], bezier.q([firstPoint, firstPoint, lastPoint, lastPoint], u));

              X[0] += maths.dot(a[0], tmp);
              X[1] += maths.dot(a[1], tmp);
          }

          //Compute the determinants of C and X
          det_C0_C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
          det_C0_X = C[0][0] * X[1] - C[1][0] * X[0];
          det_X_C1 = X[0] * C[1][1] - X[1] * C[0][1];

          //Finally, derive alpha values
          alpha_l = det_C0_C1 === 0 ? 0 : det_X_C1 / det_C0_C1;
          alpha_r = det_C0_C1 === 0 ? 0 : det_C0_X / det_C0_C1;

          //If alpha negative, use the Wu/Barsky heuristic (see text).
          //If alpha is 0, you get coincident control points that lead to
          //divide by zero in any subsequent NewtonRaphsonRootFind() call.
          segLength = maths.vectorLen(maths.subtract(firstPoint, lastPoint));
          epsilon = 1.0e-6 * segLength;
          if (alpha_l < epsilon || alpha_r < epsilon) {
              //Fall back on standard (probably inaccurate) formula, and subdivide further if needed.
              bezCurve[1] = maths.addArrays(firstPoint, maths.mulItems(leftTangent, segLength / 3.0));
              bezCurve[2] = maths.addArrays(lastPoint, maths.mulItems(rightTangent, segLength / 3.0));
          } else {
              //First and last control points of the Bezier curve are
              //positioned exactly at the first and last data points
              //Control points 1 and 2 are positioned an alpha distance out
              //on the tangent vectors, left and right, respectively
              bezCurve[1] = maths.addArrays(firstPoint, maths.mulItems(leftTangent, alpha_l));
              bezCurve[2] = maths.addArrays(lastPoint, maths.mulItems(rightTangent, alpha_r));
          }

          return bezCurve;
      };

      /**
       * Given set of points and their parameterization, try to find a better parameterization.
       *
       * @param {Array<Array<Number>>} bezier - Current fitted curve
       * @param {Array<Array<Number>>} points - Array of digitized points
       * @param {Array<Number>} parameters - Current parameter values
       * @returns {Array<Number>} New parameter values
       */
      function reparameterize(bezier, points, parameters) {
          /*
          var j, len, point, results, u;
          results = [];
          for (j = 0, len = points.length; j < len; j++) {
              point = points[j], u = parameters[j];
               results.push(newtonRaphsonRootFind(bezier, point, u));
          }
          return results;
          //*/
          return parameters.map(function (p, i) {
              return newtonRaphsonRootFind(bezier, points[i], p);
          });
      };

      /**
       * Use Newton-Raphson iteration to find better root.
       *
       * @param {Array<Array<Number>>} bez - Current fitted curve
       * @param {Array<Number>} point - Digitized point
       * @param {Number} u - Parameter value for "P"
       * @returns {Number} New u
       */
      function newtonRaphsonRootFind(bez, point, u) {
          /*
              Newton's root finding algorithm calculates f(x)=0 by reiterating
              x_n+1 = x_n - f(x_n)/f'(x_n)
              We are trying to find curve parameter u for some point p that minimizes
              the distance from that point to the curve. Distance point to curve is d=q(u)-p.
              At minimum distance the point is perpendicular to the curve.
              We are solving
              f = q(u)-p * q'(u) = 0
              with
              f' = q'(u) * q'(u) + q(u)-p * q''(u)
              gives
              u_n+1 = u_n - |q(u_n)-p * q'(u_n)| / |q'(u_n)**2 + q(u_n)-p * q''(u_n)|
          */

          var d = maths.subtract(bezier.q(bez, u), point),
              qprime = bezier.qprime(bez, u),
              numerator = maths.mulMatrix(d, qprime),
              denominator = maths.sum(maths.squareItems(qprime)) + 2 * maths.mulMatrix(d, bezier.qprimeprime(bez, u));

          if (denominator === 0) {
              return u;
          } else {
              return u - numerator / denominator;
          }
      };

      /**
       * Assign parameter values to digitized points using relative distances between points.
       *
       * @param {Array<Array<Number>>} points - Array of digitized points
       * @returns {Array<Number>} Parameter values
       */
      function chordLengthParameterize(points) {
          var u = [],
              currU,
              prevU,
              prevP;

          points.forEach(function (p, i) {
              currU = i ? prevU + maths.vectorLen(maths.subtract(p, prevP)) : 0;
              u.push(currU);

              prevU = currU;
              prevP = p;
          });
          u = u.map(function (x) {
              return x / prevU;
          });

          return u;
      };

      /**
       * Find the maximum squared distance of digitized points to fitted curve.
       *
       * @param {Array<Array<Number>>} points - Array of digitized points
       * @param {Array<Array<Number>>} bez - Fitted curve
       * @param {Array<Number>} parameters - Parameterization of points
       * @returns {Array<Number>} Maximum error (squared) and point of max error
       */
      function computeMaxError(points, bez, parameters) {
          var dist, //Current error
          maxDist, //Maximum error
          splitPoint, //Point of maximum error
          v, //Vector from point to curve
          i, count, point, t;

          maxDist = 0;
          splitPoint = Math.floor(points.length / 2);

          var t_distMap = mapTtoRelativeDistances(bez, 10);

          for (i = 0, count = points.length; i < count; i++) {
              point = points[i];
              //Find 't' for a point on the bez curve that's as close to 'point' as possible:
              t = find_t(bez, parameters[i], t_distMap, 10);

              v = maths.subtract(bezier.q(bez, t), point);
              dist = v[0] * v[0] + v[1] * v[1];

              if (dist > maxDist) {
                  maxDist = dist;
                  splitPoint = i;
              }
          }

          return [maxDist, splitPoint];
      };

      //Sample 't's and map them to relative distances along the curve:
      var mapTtoRelativeDistances = function mapTtoRelativeDistances(bez, B_parts) {
          var B_t_curr;
          var B_t_dist = [0];
          var B_t_prev = bez[0];
          var sumLen = 0;

          for (var i = 1; i <= B_parts; i++) {
              B_t_curr = bezier.q(bez, i / B_parts);

              sumLen += maths.vectorLen(maths.subtract(B_t_curr, B_t_prev));

              B_t_dist.push(sumLen);
              B_t_prev = B_t_curr;
          }

          //Normalize B_length to the same interval as the parameter distances; 0 to 1:
          B_t_dist = B_t_dist.map(function (x) {
              return x / sumLen;
          });
          return B_t_dist;
      };

      function find_t(bez, param, t_distMap, B_parts) {
          if (param < 0) {
              return 0;
          }
          if (param > 1) {
              return 1;
          }

          /*
              'param' is a value between 0 and 1 telling us the relative position
              of a point on the source polyline (linearly from the start (0) to the end (1)).
              To see if a given curve - 'bez' - is a close approximation of the polyline,
              we compare such a poly-point to the point on the curve that's the same
              relative distance along the curve's length.
               But finding that curve-point takes a little work:
              There is a function "B(t)" to find points along a curve from the parametric parameter 't'
              (also relative from 0 to 1: http://stackoverflow.com/a/32841764/1869660
                                          http://pomax.github.io/bezierinfo/#explanation),
              but 't' isn't linear by length (http://gamedev.stackexchange.com/questions/105230).
               So, we sample some points along the curve using a handful of values for 't'.
              Then, we calculate the length between those samples via plain euclidean distance;
              B(t) concentrates the points around sharp turns, so this should give us a good-enough outline of the curve.
              Thus, for a given relative distance ('param'), we can now find an upper and lower value
              for the corresponding 't' by searching through those sampled distances.
              Finally, we just use linear interpolation to find a better value for the exact 't'.
               More info:
                  http://gamedev.stackexchange.com/questions/105230/points-evenly-spaced-along-a-bezier-curve
                  http://stackoverflow.com/questions/29438398/cheap-way-of-calculating-cubic-bezier-length
                  http://steve.hollasch.net/cgindex/curves/cbezarclen.html
                  https://github.com/retuxx/tinyspline
          */
          var lenMax, lenMin, tMax, tMin, t;

          //Find the two t-s that the current param distance lies between,
          //and then interpolate a somewhat accurate value for the exact t:
          for (var i = 1; i <= B_parts; i++) {

              if (param <= t_distMap[i]) {
                  tMin = (i - 1) / B_parts;
                  tMax = i / B_parts;
                  lenMin = t_distMap[i - 1];
                  lenMax = t_distMap[i];

                  t = (param - lenMin) / (lenMax - lenMin) * (tMax - tMin) + tMin;
                  break;
              }
          }
          return t;
      }

      /**
       * Creates a vector of length 1 which shows the direction from B to A
       */
      function createTangent(pointA, pointB) {
          return maths.normalize(maths.subtract(pointA, pointB));
      }

      /*
          Simplified versions of what we need from math.js
          Optimized for our input, which is only numbers and 1x2 arrays (i.e. [x, y] coordinates).
      */

      var maths = function () {
          function maths() {
              _classCallCheck(this, maths);
          }

          maths.zeros_Xx2x2 = function zeros_Xx2x2(x) {
              var zs = [];
              while (x--) {
                  zs.push([0, 0]);
              }
              return zs;
          };

          maths.mulItems = function mulItems(items, multiplier) {
              return items.map(function (x) {
                  return x * multiplier;
              });
          };

          maths.mulMatrix = function mulMatrix(m1, m2) {
              //https://en.wikipedia.org/wiki/Matrix_multiplication#Matrix_product_.28two_matrices.29
              //Simplified to only handle 1-dimensional matrices (i.e. arrays) of equal length:
              return m1.reduce(function (sum, x1, i) {
                  return sum + x1 * m2[i];
              }, 0);
          };

          maths.subtract = function subtract(arr1, arr2) {
              return arr1.map(function (x1, i) {
                  return x1 - arr2[i];
              });
          };

          maths.addArrays = function addArrays(arr1, arr2) {
              return arr1.map(function (x1, i) {
                  return x1 + arr2[i];
              });
          };

          maths.addItems = function addItems(items, addition) {
              return items.map(function (x) {
                  return x + addition;
              });
          };

          maths.sum = function sum(items) {
              return items.reduce(function (sum, x) {
                  return sum + x;
              });
          };

          maths.dot = function dot(m1, m2) {
              return maths.mulMatrix(m1, m2);
          };

          maths.vectorLen = function vectorLen(v) {
              return Math.hypot.apply(Math, v);
          };

          maths.divItems = function divItems(items, divisor) {
              return items.map(function (x) {
                  return x / divisor;
              });
          };

          maths.squareItems = function squareItems(items) {
              return items.map(function (x) {
                  return x * x;
              });
          };

          maths.normalize = function normalize(v) {
              return this.divItems(v, this.vectorLen(v));
          };

          return maths;
      }();

      var bezier = function () {
          function bezier() {
              _classCallCheck(this, bezier);
          }

          bezier.q = function q(ctrlPoly, t) {
              var tx = 1.0 - t;
              var pA = maths.mulItems(ctrlPoly[0], tx * tx * tx),
                  pB = maths.mulItems(ctrlPoly[1], 3 * tx * tx * t),
                  pC = maths.mulItems(ctrlPoly[2], 3 * tx * t * t),
                  pD = maths.mulItems(ctrlPoly[3], t * t * t);
              return maths.addArrays(maths.addArrays(pA, pB), maths.addArrays(pC, pD));
          };

          bezier.qprime = function qprime(ctrlPoly, t) {
              var tx = 1.0 - t;
              var pA = maths.mulItems(maths.subtract(ctrlPoly[1], ctrlPoly[0]), 3 * tx * tx),
                  pB = maths.mulItems(maths.subtract(ctrlPoly[2], ctrlPoly[1]), 6 * tx * t),
                  pC = maths.mulItems(maths.subtract(ctrlPoly[3], ctrlPoly[2]), 3 * t * t);
              return maths.addArrays(maths.addArrays(pA, pB), pC);
          };

          bezier.qprimeprime = function qprimeprime(ctrlPoly, t) {
              return maths.addArrays(maths.mulItems(maths.addArrays(maths.subtract(ctrlPoly[2], maths.mulItems(ctrlPoly[1], 2)), ctrlPoly[0]), 6 * (1.0 - t)), maths.mulItems(maths.addArrays(maths.subtract(ctrlPoly[3], maths.mulItems(ctrlPoly[2], 2)), ctrlPoly[1]), 6 * t));
          };

          return bezier;
      }();

      module.exports = fitCurve;
      module.exports.fitCubic = fitCubic;
      module.exports.createTangent = createTangent;
  });
  return module.exports;
})();

var simplifyPathLib = (function () {
  var module = { exports: {} };
  var exports = module.exports;
  /*
   (c) 2017, Vladimir Agafonkin
   Simplify.js, a high-performance JS polyline simplification library
   mourner.github.io/simplify-js
  */

  (function () { 'use strict';

  // to suit your point format, run search/replace for '.x' and '.y';
  // for 3D version, see 3d branch (configurability would draw significant performance overhead)

  // square distance between 2 points
  function getSqDist(p1, p2) {

      var dx = p1.x - p2.x,
          dy = p1.y - p2.y;

      return dx * dx + dy * dy;
  }

  // square distance from a point to a segment
  function getSqSegDist(p, p1, p2) {

      var x = p1.x,
          y = p1.y,
          dx = p2.x - x,
          dy = p2.y - y;

      if (dx !== 0 || dy !== 0) {

          var t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);

          if (t > 1) {
              x = p2.x;
              y = p2.y;

          } else if (t > 0) {
              x += dx * t;
              y += dy * t;
          }
      }

      dx = p.x - x;
      dy = p.y - y;

      return dx * dx + dy * dy;
  }
  // rest of the code doesn't care about point format

  // basic distance-based simplification
  function simplifyRadialDist(points, sqTolerance) {

      var prevPoint = points[0],
          newPoints = [prevPoint],
          point;

      for (var i = 1, len = points.length; i < len; i++) {
          point = points[i];

          if (getSqDist(point, prevPoint) > sqTolerance) {
              newPoints.push(point);
              prevPoint = point;
          }
      }

      if (prevPoint !== point) newPoints.push(point);

      return newPoints;
  }

  function simplifyDPStep(points, first, last, sqTolerance, simplified) {
      var maxSqDist = sqTolerance,
          index;

      for (var i = first + 1; i < last; i++) {
          var sqDist = getSqSegDist(points[i], points[first], points[last]);

          if (sqDist > maxSqDist) {
              index = i;
              maxSqDist = sqDist;
          }
      }

      if (maxSqDist > sqTolerance) {
          if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
          simplified.push(points[index]);
          if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
      }
  }

  // simplification using Ramer-Douglas-Peucker algorithm
  function simplifyDouglasPeucker(points, sqTolerance) {
      var last = points.length - 1;

      var simplified = [points[0]];
      simplifyDPStep(points, 0, last, sqTolerance, simplified);
      simplified.push(points[last]);

      return simplified;
  }

  // both algorithms combined for awesome performance
  function simplify(points, tolerance, highestQuality) {

      if (points.length <= 2) return points;

      var sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;

      points = highestQuality ? points : simplifyRadialDist(points, sqTolerance);
      points = simplifyDouglasPeucker(points, sqTolerance);

      return points;
  }

  // export as AMD module / Node module / browser or worker variable
  if (typeof define === 'function' && define.amd) define(function() { return simplify; });
  else if (typeof module !== 'undefined') {
      module.exports = simplify;
      module.exports.default = simplify;
  } else if (typeof self !== 'undefined') self.simplify = simplify;
  else window.simplify = simplify;

  })();
  return module.exports.default || module.exports;
})();

const DATA_NAMESPACE = "appearance_stack";
const DATA_KIND = "kind";
const DATA_STACK = "stack";
const DATA_GLOBAL = "global";
const DATA_BLEND = "blend";
const DATA_BLEND_ROLE = "blend_role";
const DATA_THREE_SOURCE = "three_source";
const DATA_THREE_META = "three_meta";
const KIND_GROUP = "group";
const KIND_BASE = "base";
const KIND_RENDER = "render";
const KIND_BLEND_GROUP = "blend_group";
const KIND_BLEND_BASE = "blend_base";
const KIND_BLEND_RENDER = "blend_render";
const KIND_THREE_RENDER = "three_render";
const BLEND_ROLE_START = "start";
const BLEND_ROLE_END = "end";

const DEFAULT_FILL = "#4F8DFF";
const DEFAULT_STROKE = "#111111";
const DEFAULT_GRADIENT_END = "#B96BFF";
const DEFAULT_SHADOW = "#000000";
const STYLE_CLIPBOARD_KEY = "appearance_stack_clipboard";
const SWATCH_STORAGE_KEY = "appearance_stack_swatches";
const BLEND_MODES = [
  "NORMAL",
  "MULTIPLY",
  "SCREEN",
  "OVERLAY",
  "DARKEN",
  "LIGHTEN",
  "COLOR_DODGE",
  "COLOR_BURN",
  "HARD_LIGHT",
  "SOFT_LIGHT",
  "DIFFERENCE",
  "EXCLUSION",
  "HUE",
  "SATURATION",
  "COLOR",
  "LUMINOSITY"
];
const STROKE_CAPS = ["NONE", "ROUND", "SQUARE"];
const STROKE_JOINS = ["MITER", "ROUND", "BEVEL"];
const STROKE_ALIGNS = ["CENTER", "INSIDE", "OUTSIDE"];
const PAINT_TYPES = ["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL"];
const SHAPE_EFFECT_TYPES = ["RECTANGLE", "ROUNDED_RECTANGLE", "ELLIPSE"];
const OFFSET_JOINS = ["MITER", "ROUND", "BEVEL"];
const WARP_STYLES = ["ARC", "ARC_LOWER", "ARC_UPPER", "FLAG", "RISE"];
const WARP_AXES = ["HORIZONTAL", "VERTICAL"];
const BLEND_SPACING_MODES = ["SPECIFIED_STEPS", "SPECIFIED_DISTANCE", "SMOOTH_COLOR"];

function getSelection() {
  return figma.currentPage.selection.filter((node) => "clone" in node);
}

function getActiveAppearanceGroup() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return null;
  const node = selection[0];
  if (isAppearanceGroup(node)) return ensureFrameContainer(node);
  let parent = node.parent;
  while (parent && parent.type !== "PAGE") {
    if (isAppearanceGroup(parent)) return ensureFrameContainer(parent);
    parent = parent.parent;
  }
  return null;
}

function isAppearanceGroup(node) {
  return (node.type === "GROUP" || node.type === "FRAME") && node.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_GROUP;
}

function ensureFrameContainer(node) {
  if (node.type !== "GROUP") return node;
  if (!node.parent || node.parent.type === "DOCUMENT") return node;

  const parent = node.parent;
  const frame = figma.createFrame();
  const index = getChildIndex(parent, node);
  frame.name = node.name;
  frame.x = node.x;
  frame.y = node.y;
  frame.resizeWithoutConstraints(Math.max(0.01, node.width), Math.max(0.01, node.height));
  frame.clipsContent = false;
  frame.fills = [];
  frame.strokes = [];
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_GROUP);
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_STACK, node.getSharedPluginData(DATA_NAMESPACE, DATA_STACK));
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL, node.getSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL));
  parent.insertChild(index >= 0 ? index : parent.children.length, frame);

  for (const child of node.children.slice()) {
    const childX = child.x;
    const childY = child.y;
    frame.appendChild(child);
    child.x = childX;
    child.y = childY;
  }

  node.remove();
  figma.currentPage.selection = [frame];
  return frame;
}

function notifySelectAppearance() {
  figma.notify("Select an Appearance Stack group first.");
}

async function wrapSelection() {
  const selection = getSelection();
  if (selection.length !== 1) {
    figma.notify("Select one object to create an appearance stack.");
    return;
  }

  const node = selection[0];
  if (isAppearanceGroup(node)) {
    figma.notify("This object already has an appearance stack.");
    return;
  }

  if (!node.parent || node.parent.type === "DOCUMENT") {
    figma.notify("This object cannot be wrapped here.");
    return;
  }

  const parent = node.parent;
  const originalName = node.name;
  const stack = inferInitialStack(node);
  const group = createAppearanceFrame(node, parent, originalName);
  writeGlobalAppearance(group, createGlobalAppearance(node));
  node.name = `${originalName} base`;
  node.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BASE);
  if (group.type === "FRAME") {
    group.appendChild(node);
    node.x = 0;
    node.y = 0;
  }

  await renderAppearance(group, stack);
  figma.currentPage.selection = [group];
  figma.notify("Appearance stack created.");
}

function createAppearanceFrame(node, parent, originalName) {
  if ("width" in node && "height" in node) {
    const frame = figma.createFrame();
    const index = getChildIndex(parent, node);
    frame.name = `${originalName} Appearance`;
    frame.x = node.x;
    frame.y = node.y;
    frame.resizeWithoutConstraints(Math.max(0.01, node.width), Math.max(0.01, node.height));
    frame.clipsContent = false;
    frame.fills = [];
    frame.strokes = [];
    frame.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_GROUP);
    parent.insertChild(index >= 0 ? index : parent.children.length, frame);
    return frame;
  }

  const group = figma.group([node], parent);
  group.name = `${originalName} Appearance`;
  group.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_GROUP);
  return group;
}

function getChildIndex(parent, node) {
  return parent.children.findIndex((child) => child.id === node.id);
}

async function detachAppearance() {
  const group = getActiveAppearanceGroup();
  if (!group) return notifySelectAppearance();
  const base = findBase(group);
  if (!base || !group.parent) {
    figma.notify("Could not find the base object.");
    return;
  }

  const parent = group.parent;
  const baseX = base.x;
  const baseY = base.y;
  base.visible = true;
  base.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, "");
  base.name = base.name.replace(/\sbase$/, "");
  parent.appendChild(base);
  if (group.type === "FRAME") {
    base.x = group.x + baseX;
    base.y = group.y + baseY;
  } else {
    base.x = group.x;
    base.y = group.y;
  }
  group.remove();
  figma.currentPage.selection = [base];
  figma.notify("Appearance stack detached.");
}

async function sendThreeDSource() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    figma.ui.postMessage({
      type: "3d-source",
      source: null
    });
    return;
  }

  const node = selection[0];
  if (isThreeDRenderNode(node)) {
    figma.ui.postMessage({
      type: "3d-source",
      source: readThreeDRenderSource(node)
    });
    return;
  }

  if (!node || typeof node.exportAsync !== "function") {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: "Selected object cannot be exported as SVG."
    });
    return;
  }

  await sendNodeAsThreeDSource(node, false, "");
}

async function sendThreeDSourceById(nodeId, renderNodeId) {
  if (!nodeId || typeof figma.getNodeByIdAsync !== "function") {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: "Original source is no longer available."
    });
    return;
  }

  const node = await figma.getNodeByIdAsync(String(nodeId));
  if (!node || typeof node.exportAsync !== "function") {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: "Original source is missing or cannot be exported."
    });
    return;
  }

  await sendNodeAsThreeDSource(node, false, renderNodeId || "");
}

async function placeThreeDRender(payload) {
  const imageBytes = decodeBase64Png(payload && payload.pngDataUrl);
  if (!imageBytes) {
    throw new Error("3D preview image is missing.");
  }

  const image = figma.createImage(imageBytes);
  const selection = figma.currentPage.selection;
  const selectedNode = selection.length === 1 ? selection[0] : null;
  const updatingExisting = isThreeDRenderNode(selectedNode);
  const hasSeparateBloom = Boolean(payload && payload.bloomDataUrl);
  const sourceNode = updatingExisting ? null : selectedNode;
  const targetWidth = clampNumber(payload && payload.width, 1, 10000, updatingExisting ? ("width" in selectedNode ? selectedNode.width : 240) : sourceNode && "width" in sourceNode ? sourceNode.width : 240);
  const targetHeight = clampNumber(payload && payload.height, 1, 10000, updatingExisting ? ("height" in selectedNode ? selectedNode.height : 240) : sourceNode && "height" in sourceNode ? sourceNode.height : 240);

  let container = updatingExisting ? selectedNode : null;
  if (!container) {
    container = hasSeparateBloom ? figma.createFrame() : figma.createRectangle();
  } else if (hasSeparateBloom && container.type !== "FRAME") {
    container = convertThreeDRenderToFrame(container, targetWidth, targetHeight);
  }

  if (!container) {
    throw new Error("Could not create 3D render container.");
  }

  container.name = (payload && payload.name ? payload.name : "3D Object") + " Render";

  if (hasSeparateBloom && container.type === "FRAME") {
    container.clipsContent = false;
    container.fills = [];
    container.strokes = [];
    container.resizeWithoutConstraints(Math.max(1, targetWidth), Math.max(1, targetHeight));
    const baseRect = ensureThreeDFrameChild(container, "Base");
    applyThreeDImageFill(baseRect, image.hash);
    baseRect.resizeWithoutConstraints(Math.max(1, targetWidth), Math.max(1, targetHeight));
    baseRect.x = 0;
    baseRect.y = 0;

    const bloomBytes = decodeBase64Png(payload && payload.bloomDataUrl);
    const bloomImage = bloomBytes ? figma.createImage(bloomBytes) : null;
    const bloomRect = ensureThreeDFrameChild(container, "Bloom");
    if (bloomImage) {
      applyThreeDImageFill(bloomRect, bloomImage.hash);
    }
    bloomRect.resizeWithoutConstraints(Math.max(1, targetWidth), Math.max(1, targetHeight));
    bloomRect.x = 0;
    bloomRect.y = 0;
    bloomRect.opacity = clampNumber(payload && payload.bloomOpacity, 0, 100, 100) / 100;
    if ("blendMode" in bloomRect) {
      bloomRect.blendMode = normalizeBlendMode(payload && payload.bloomBlendMode ? payload.bloomBlendMode : "SCREEN");
    }
  } else {
    const rect = container;
    rect.fills = [{
      type: "IMAGE",
      scaleMode: "FIT",
      imageHash: image.hash
    }];
    rect.strokes = [];
    rect.resizeWithoutConstraints(Math.max(1, targetWidth), Math.max(1, targetHeight));
  }

  if (!updatingExisting && sourceNode && sourceNode.parent && sourceNode.parent.type !== "DOCUMENT") {
    const parent = sourceNode.parent;
    const index = getChildIndex(parent, sourceNode);
    parent.insertChild(index >= 0 ? index + 1 : parent.children.length, container);
    container.x = sourceNode.x;
    container.y = sourceNode.y;
  } else if (!updatingExisting) {
    figma.currentPage.appendChild(container);
    container.x = figma.viewport.center.x - targetWidth / 2;
    container.y = figma.viewport.center.y - targetHeight / 2;
  }

  writeThreeDRenderData(container, payload);
  figma.currentPage.selection = [container];
  figma.notify(updatingExisting ? "3D render updated." : "3D render placed on canvas.");
}

function applyThreeDImageFill(node, imageHash) {
  node.fills = [{
    type: "IMAGE",
    scaleMode: "FIT",
    imageHash: imageHash
  }];
  node.strokes = [];
}

function ensureThreeDFrameChild(frame, role) {
  const targetName = role === "Bloom" ? "Bloom Flare" : "Base Render";
  const existing = frame.children.find((child) => child.type === "RECTANGLE" && child.name === targetName);
  if (existing) return existing;
  const rect = figma.createRectangle();
  rect.name = targetName;
  frame.appendChild(rect);
  return rect;
}

function convertThreeDRenderToFrame(node, width, height) {
  const frame = figma.createFrame();
  frame.name = node.name;
  frame.fills = [];
  frame.strokes = [];
  frame.clipsContent = false;
  frame.resizeWithoutConstraints(Math.max(1, width), Math.max(1, height));
  frame.x = node.x;
  frame.y = node.y;
  if (node.parent && node.parent.type !== "DOCUMENT") {
    const parent = node.parent;
    const index = getChildIndex(parent, node);
    parent.insertChild(index >= 0 ? index : parent.children.length, frame);
    frame.x = node.x;
    frame.y = node.y;
    parent.removeChild(node);
  } else {
    figma.currentPage.appendChild(frame);
    frame.x = node.x;
    frame.y = node.y;
    figma.currentPage.removeChild(node);
  }
  return frame;
}

async function sendNodeAsThreeDSource(node, fromRender, renderNodeId) {
  try {
    const svgBytes = await node.exportAsync({
      format: "SVG",
      contentsOnly: true,
      useAbsoluteBounds: true,
      svgOutlineText: true,
      svgSimplifyStroke: false
    });
    figma.ui.postMessage({
      type: "3d-source",
      source: {
        name: node.name || "3D Source",
        nodeType: node.type,
        width: "width" in node ? node.width : 0,
        height: "height" in node ? node.height : 0,
        svg: decodeUtf8Bytes(svgBytes),
        renderNodeId: renderNodeId || "",
        fromRender: fromRender === true,
        sourceNodeId: node.id
      }
    });
  } catch (error) {
    figma.ui.postMessage({
      type: "3d-source",
      source: null,
      error: error && error.message ? error.message : "Could not export the selected object as SVG."
    });
  }
}

function isThreeDRenderNode(node) {
  return Boolean(node && (node.type === "RECTANGLE" || node.type === "FRAME" || node.type === "ELLIPSE" || node.type === "POLYGON" || node.type === "STAR" || node.type === "VECTOR") && node.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_THREE_RENDER);
}

function readThreeDRenderSource(node) {
  const sourceRaw = node.getSharedPluginData(DATA_NAMESPACE, DATA_THREE_SOURCE);
  const metaRaw = node.getSharedPluginData(DATA_NAMESPACE, DATA_THREE_META);
  let meta = {};
  try {
    meta = metaRaw ? JSON.parse(metaRaw) : {};
  } catch (_error) {
    meta = {};
  }
  return {
    name: meta.name || node.name.replace(/\sRender$/, ""),
    nodeType: meta.nodeType || "RENDER",
    width: "width" in node ? node.width : meta.width || 0,
    height: "height" in node ? node.height : meta.height || 0,
    svg: sourceRaw || "",
    mode: meta.mode || "extrude",
    settings: meta.settings || null,
    renderNodeId: node.id,
    fromRender: true,
    sourceNodeId: meta.sourceNodeId || ""
  };
}

function writeThreeDRenderData(node, payload) {
  node.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_THREE_RENDER);
  node.setSharedPluginData(DATA_NAMESPACE, DATA_THREE_SOURCE, String(payload && payload.svgSource || ""));
  node.setSharedPluginData(DATA_NAMESPACE, DATA_THREE_META, JSON.stringify({
    name: payload && payload.name ? payload.name : "3D Object",
    nodeType: payload && payload.nodeType ? payload.nodeType : "RENDER",
    width: payload && payload.width ? payload.width : ("width" in node ? node.width : 0),
    height: payload && payload.height ? payload.height : ("height" in node ? node.height : 0),
    mode: payload && payload.mode ? payload.mode : "extrude",
    settings: payload && payload.settings ? payload.settings : {},
    sourceNodeId: payload && payload.sourceNodeId ? payload.sourceNodeId : ""
  }));
}

function decodeUtf8Bytes(bytes) {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }

  let result = "";
  for (let index = 0; index < bytes.length; index++) {
    result += String.fromCharCode(bytes[index]);
  }
  return result;
}

function decodeBase64Png(dataUrl) {
  const raw = String(dataUrl || "");
  const comma = raw.indexOf(",");
  const base64 = comma >= 0 ? raw.slice(comma + 1) : raw;
  if (!base64) return null;
  return base64ToBytes(base64);
}

function base64ToBytes(base64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const cleaned = String(base64).replace(/[^A-Za-z0-9+/=]/g, "");
  const output = [];
  let buffer = 0;
  let bits = 0;

  for (let index = 0; index < cleaned.length; index++) {
    const char = cleaned.charAt(index);
    if (char === "=") break;
    const value = alphabet.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push(buffer >> bits & 255);
    }
  }

  return new Uint8Array(output);
}

async function renderAppearance(group, stack) {
  const base = findBase(group);
  if (!base) throw new Error("Missing base object.");

  for (const child of group.children.slice()) {
    if (child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_RENDER) {
      child.remove();
    }
  }

  const normalized = stack.map(normalizeLayer);
  const globalAppearance = readGlobalAppearance(group);
  applyGlobalAppearance(group, globalAppearance);
  base.visible = true;

  for (const layer of normalized) {
    if (!layer.visible) continue;
    const transforms = getTransformInstances(layer);
    for (const transform of transforms) {
      let render = createLayerRenderNode(base, layer);
      render.name = transform.label ? `${layer.name} ${transform.label}` : layer.name;
      render.visible = true;
      render.locked = false;
      render.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_RENDER);
      applyLayerAppearance(render, layer, base);
      render = applyGeometryPipelineEffects(render, layer);
      applyTransformInstance(render, transform);
      group.appendChild(render);
      appendRasterEffectOverlays(group, base, layer, transform);
    }
  }

  base.visible = false;
  group.setSharedPluginData(DATA_NAMESPACE, DATA_STACK, JSON.stringify(normalized));
}

function findBase(group) {
  return group.children.find((child) => child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_BASE) || null;
}

async function setTextContent(textNode, characters) {
  await loadFontsForText(textNode);
  textNode.characters = characters;
}

async function loadFontsForText(textNode) {
  const fonts = [];
  if (typeof textNode.getRangeAllFontNames === "function" && textNode.characters.length > 0) {
    const rangeFonts = textNode.getRangeAllFontNames(0, textNode.characters.length);
    for (const fontName of rangeFonts) {
      fonts.push(fontName);
    }
  } else if (textNode.characters.length > 0 && typeof textNode.getRangeFontName === "function") {
    for (let index = 0; index < textNode.characters.length; index++) {
      const fontName = textNode.getRangeFontName(index, index + 1);
      if (isFontName(fontName)) fonts.push(fontName);
    }
  } else if (isFontName(textNode.fontName)) {
    fonts.push(textNode.fontName);
  }

  const seen = {};
  for (const font of fonts) {
    const key = `${font.family}::${font.style}`;
    if (seen[key]) continue;
    seen[key] = true;
    await figma.loadFontAsync(font);
  }
}

function isFontName(value) {
  return value && typeof value.family === "string" && typeof value.style === "string";
}

function readTextProperties(textNode) {
  const fontName = readWholeTextFontName(textNode);
  const lineHeight = normalizeTextLineHeight(textNode.lineHeight);
  const letterSpacing = normalizeTextLetterSpacing(textNode.letterSpacing);
  return {
    fontFamily: fontName.family,
    fontStyle: fontName.style,
    fontSize: readWholeTextNumber(textNode, "fontSize", 12),
    lineHeightMode: lineHeight.mode,
    lineHeightValue: lineHeight.value,
    letterSpacingMode: letterSpacing.mode,
    letterSpacingValue: letterSpacing.value,
    paragraphSpacing: readWholeTextNumber(textNode, "paragraphSpacing", 0),
    textCase: typeof textNode.textCase === "string" ? textNode.textCase : "ORIGINAL",
    textDecoration: typeof textNode.textDecoration === "string" ? textNode.textDecoration : "NONE"
  };
}

async function applyTextProperties(textNode, properties) {
  const current = readTextProperties(textNode);
  const nextFont = {
    family: properties.fontFamily || current.fontFamily,
    style: properties.fontStyle || current.fontStyle
  };

  await loadFontsForText(textNode);
  if (isFontName(nextFont)) await figma.loadFontAsync(nextFont);

  if (properties.fontFamily !== undefined || properties.fontStyle !== undefined) textNode.fontName = nextFont;
  if (properties.fontSize !== undefined && properties.fontSize !== "") textNode.fontSize = clampNumber(properties.fontSize, 1, 1000, current.fontSize);
  if (properties.lineHeightMode !== undefined || properties.lineHeightValue !== undefined) textNode.lineHeight = textLineHeightFromProperties(properties, current);
  if (properties.letterSpacingMode !== undefined || properties.letterSpacingValue !== undefined) textNode.letterSpacing = textLetterSpacingFromProperties(properties, current);
  if ("paragraphSpacing" in textNode && properties.paragraphSpacing !== undefined && properties.paragraphSpacing !== "") {
    textNode.paragraphSpacing = clampNumber(properties.paragraphSpacing, 0, 10000, current.paragraphSpacing);
  }
  if ("textCase" in textNode && properties.textCase !== undefined) textNode.textCase = normalizeTextCase(properties.textCase);
  if ("textDecoration" in textNode && properties.textDecoration !== undefined) textNode.textDecoration = normalizeTextDecoration(properties.textDecoration);
}

function readWholeTextFontName(textNode) {
  if (isFontName(textNode.fontName)) return textNode.fontName;
  if (textNode.characters.length > 0 && typeof textNode.getRangeFontName === "function") {
    const fontName = textNode.getRangeFontName(0, 1);
    if (isFontName(fontName)) return fontName;
  }
  return { family: "Inter", style: "Regular" };
}

function readWholeTextNumber(textNode, property, fallback) {
  const value = textNode[property];
  if (typeof value === "number") return roundForUi(value);
  return fallback;
}

function normalizeTextLineHeight(value) {
  if (!value || value === figma.mixed || value.unit === "AUTO") return { mode: "AUTO", value: "" };
  if (value.unit === "PERCENT") return { mode: "PERCENT", value: roundForUi(value.value) };
  return { mode: "PIXELS", value: roundForUi(value.value) };
}

function normalizeTextLetterSpacing(value) {
  if (!value || value === figma.mixed) return { mode: "PIXELS", value: 0 };
  if (value.unit === "PERCENT") return { mode: "PERCENT", value: roundForUi(value.value) };
  return { mode: "PIXELS", value: roundForUi(value.value) };
}

function textLineHeightFromProperties(properties, current) {
  const mode = properties.lineHeightMode || current.lineHeightMode || "AUTO";
  if (mode === "AUTO") return { unit: "AUTO" };
  return {
    unit: mode,
    value: clampNumber(properties.lineHeightValue, 0, 10000, current.lineHeightValue || current.fontSize)
  };
}

function textLetterSpacingFromProperties(properties, current) {
  const mode = properties.letterSpacingMode || current.letterSpacingMode || "PIXELS";
  return {
    unit: mode,
    value: clampNumber(properties.letterSpacingValue, -1000, 1000, current.letterSpacingValue || 0)
  };
}

function normalizeTextCase(value) {
  return ["ORIGINAL", "UPPER", "LOWER", "TITLE"].includes(value) ? value : "ORIGINAL";
}

function normalizeTextDecoration(value) {
  return ["NONE", "UNDERLINE", "STRIKETHROUGH"].includes(value) ? value : "NONE";
}

function readObjectProperties(group, base) {
  const width = "width" in group ? group.width : "width" in base ? base.width : 0;
  const height = "height" in group ? group.height : "height" in base ? base.height : 0;
  return {
    x: "x" in group ? roundForUi(group.x) : 0,
    y: "y" in group ? roundForUi(group.y) : 0,
    width: roundForUi(width),
    height: roundForUi(height),
    rotation: "rotation" in group ? roundForUi(group.rotation) : 0,
    cornerRadius: readCornerRadius(base),
    hasCornerRadius: "cornerRadius" in base && typeof base.cornerRadius === "number"
  };
}

function applyObjectProperties(group, base, properties) {
  if ("x" in group && properties.x !== undefined) group.x = clampNumber(properties.x, -100000, 100000, group.x);
  if ("y" in group && properties.y !== undefined) group.y = clampNumber(properties.y, -100000, 100000, group.y);
  if ("rotation" in group && properties.rotation !== undefined) group.rotation = clampNumber(properties.rotation, -3600, 3600, group.rotation);

  const nextWidth = properties.width === undefined ? ("width" in group ? group.width : base.width) : clampNumber(properties.width, 0.01, 100000, "width" in group ? group.width : base.width);
  const nextHeight = properties.height === undefined ? ("height" in group ? group.height : base.height) : clampNumber(properties.height, 0.01, 100000, "height" in group ? group.height : base.height);

  if (group.type === "FRAME") {
    group.resizeWithoutConstraints(nextWidth, nextHeight);
    resizeBaseNode(base, nextWidth, nextHeight);
  }

  if ("cornerRadius" in base && properties.cornerRadius !== undefined && properties.cornerRadius !== "") {
    base.cornerRadius = clampNumber(properties.cornerRadius, 0, 100000, readCornerRadius(base));
  }
}

function resizeBaseNode(base, width, height) {
  if (!("resize" in base)) return;
  try {
    base.resize(Math.max(0.01, width), Math.max(0.01, height));
  } catch (_error) {
    try {
      base.resizeWithoutConstraints(Math.max(0.01, width), Math.max(0.01, height));
    } catch (_innerError) {
      // Some nodes cannot be resized by plugins.
    }
  }
}

function readCornerRadius(base) {
  if (!("cornerRadius" in base) || typeof base.cornerRadius !== "number") return "";
  return roundForUi(base.cornerRadius);
}

function roundForUi(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function getActiveBlendGroup() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) return null;
  const node = selection[0];
  if (isBlendGroup(node)) return node;
  let parent = node.parent;
  while (parent && parent.type !== "PAGE") {
    if (isBlendGroup(parent)) return parent;
    parent = parent.parent;
  }
  return null;
}

function isBlendGroup(node) {
  return (node.type === "GROUP" || node.type === "FRAME") && node.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_BLEND_GROUP;
}

function notifySelectBlend() {
  figma.notify("Select a Blend group first.");
}

function createBlendOptions(options) {
  return normalizeBlendOptions(options || {
    spacingMode: "SPECIFIED_STEPS",
    steps: 8,
    distance: 24,
    reverseFrontToBack: false,
    editEndpoints: false
  });
}

function normalizeBlendOptions(options) {
  const source = options || {};
  return {
    spacingMode: normalizeBlendSpacingMode(source.spacingMode),
    steps: Math.round(clampNumber(source.steps, 1, 200, 8)),
    distance: clampNumber(source.distance, 1, 10000, 24),
    reverseFrontToBack: source.reverseFrontToBack === true,
    editEndpoints: source.editEndpoints === true
  };
}

function readBlendOptions(group) {
  const raw = group.getSharedPluginData(DATA_NAMESPACE, DATA_BLEND);
  if (!raw) return createBlendOptions();
  try {
    return normalizeBlendOptions(JSON.parse(raw));
  } catch (_error) {
    return createBlendOptions();
  }
}

function writeBlendOptions(group, options) {
  group.setSharedPluginData(DATA_NAMESPACE, DATA_BLEND, JSON.stringify(normalizeBlendOptions(options)));
}

async function makeBlend() {
  const selection = getSelection();
  if (selection.length !== 2) {
    figma.notify("Select exactly two objects to make a blend.");
    return;
  }

  const start = selection[0];
  const end = selection[1];
  if (!start.parent || start.parent !== end.parent || start.parent.type === "DOCUMENT") {
    figma.notify("Blend needs two objects in the same parent.");
    return;
  }
  if (!("width" in start) || !("height" in start) || !("width" in end) || !("height" in end)) {
    figma.notify("Blend needs objects with visible dimensions.");
    return;
  }

  const parent = start.parent;
  const originalName = start.name + " Blend";
  const frame = createBlendFrame(start, end, parent, originalName);
  const startX = start.x;
  const startY = start.y;
  const endX = end.x;
  const endY = end.y;
  start.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BLEND_BASE);
  start.setSharedPluginData(DATA_NAMESPACE, DATA_BLEND_ROLE, BLEND_ROLE_START);
  end.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BLEND_BASE);
  end.setSharedPluginData(DATA_NAMESPACE, DATA_BLEND_ROLE, BLEND_ROLE_END);
  frame.appendChild(start);
  frame.appendChild(end);
  start.x = startX - frame.x;
  start.y = startY - frame.y;
  end.x = endX - frame.x;
  end.y = endY - frame.y;
  start.visible = false;
  end.visible = false;
  const options = createBlendOptions();
  writeBlendOptions(frame, options);
  await renderBlend(frame, options);
  figma.currentPage.selection = [frame];
  figma.notify("Blend created.");
}

function createBlendFrame(start, end, parent, name) {
  const bounds = blendBounds(start, end);
  const frame = figma.createFrame();
  const startIndex = getChildIndex(parent, start);
  const endIndex = getChildIndex(parent, end);
  const index = Math.min(startIndex >= 0 ? startIndex : parent.children.length, endIndex >= 0 ? endIndex : parent.children.length);
  frame.name = name;
  frame.x = bounds.x;
  frame.y = bounds.y;
  frame.resizeWithoutConstraints(Math.max(0.01, bounds.width), Math.max(0.01, bounds.height));
  frame.clipsContent = false;
  frame.fills = [];
  frame.strokes = [];
  frame.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BLEND_GROUP);
  parent.insertChild(index >= 0 ? index : parent.children.length, frame);
  return frame;
}

function blendBounds(start, end) {
  const x1 = Math.min(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const x2 = Math.max(start.x + start.width, end.x + end.width);
  const y2 = Math.max(start.y + start.height, end.y + end.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

async function renderBlend(group, options) {
  const endpoints = getBlendEndpoints(group);
  if (!endpoints.start || !endpoints.end) throw new Error("Blend is missing one endpoint.");

  const normalized = normalizeBlendOptions(options);
  clearBlendRenders(group);
  endpoints.start.visible = normalized.editEndpoints;
  endpoints.end.visible = normalized.editEndpoints;
  endpoints.start.locked = false;
  endpoints.end.locked = false;

  const steps = resolvedBlendSteps(normalized, endpoints.start, endpoints.end);
  const total = steps + 2;
  const renders = [];
  const firstIndex = normalized.editEndpoints ? 1 : 0;
  const lastIndex = normalized.editEndpoints ? total - 2 : total - 1;
  for (let index = firstIndex; index <= lastIndex; index++) {
    const t = total <= 1 ? 0 : index / (total - 1);
    const render = createBlendRenderNode(endpoints.start, endpoints.end, t, group);
    render.name = "Blend " + String(index + 1).padStart(2, "0");
    render.visible = true;
    render.locked = false;
    render.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_BLEND_RENDER);
    renders.push(render);
  }

  if (normalized.reverseFrontToBack) renders.reverse();
  for (let index = 0; index < renders.length; index++) {
    group.appendChild(renders[index]);
  }
  writeBlendOptions(group, normalized);
}

function clearBlendRenders(group) {
  for (const child of group.children.slice()) {
    if (child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_BLEND_RENDER) {
      child.remove();
    }
  }
}

function getBlendEndpoints(group) {
  const result = { start: null, end: null };
  for (const child of group.children) {
    if (child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND) !== KIND_BLEND_BASE) continue;
    const role = child.getSharedPluginData(DATA_NAMESPACE, DATA_BLEND_ROLE);
    if (role === BLEND_ROLE_START) result.start = child;
    if (role === BLEND_ROLE_END) result.end = child;
  }
  return result;
}

function resolvedBlendSteps(options, start, end) {
  if (options.spacingMode === "SMOOTH_COLOR") return 24;
  if (options.spacingMode === "SPECIFIED_DISTANCE") {
    const dx = centerX(end) - centerX(start);
    const dy = centerY(end) - centerY(start);
    const distance = Math.sqrt(dx * dx + dy * dy);
    return Math.max(1, Math.min(200, Math.ceil(distance / options.distance) - 1));
  }
  return options.steps;
}

function createBlendRenderNode(start, end, t, group) {
  if (t > 0 && t < 1) {
    const morphed = createMorphedBlendPath(start, end, t, group);
    if (morphed) return morphed;
  }
  const source = t >= 1 ? end : start;
  const render = source.clone();
  applyBlendInterpolation(render, start, end, t);
  return render;
}

function applyBlendInterpolation(node, start, end, t) {
  if ("x" in node) node.x = lerp(start.x, end.x, t);
  if ("y" in node) node.y = lerp(start.y, end.y, t);
  if ("resize" in node && "width" in node && "height" in node) {
    try {
      node.resize(Math.max(0.01, lerp(start.width, end.width, t)), Math.max(0.01, lerp(start.height, end.height, t)));
    } catch (_resizeError) {}
  }
  if ("rotation" in node && "rotation" in start && "rotation" in end) node.rotation = lerp(start.rotation, end.rotation, t);
  if ("opacity" in node && "opacity" in start && "opacity" in end) node.opacity = lerp(start.opacity, end.opacity, t);
  if ("blendMode" in node && "blendMode" in start && "blendMode" in end) node.blendMode = t < 0.5 ? start.blendMode : end.blendMode;
  interpolateNodePaints(node, start, end, t);
  interpolateStrokeWeight(node, start, end, t);
}

function createMorphedBlendPath(start, end, t, group) {
  const startPath = sampleBlendPath(start, group);
  const endPath = sampleBlendPath(end, group);
  if (!startPath || !endPath) return null;

  const count = Math.max(16, Math.min(192, Math.max(startPath.points.length, endPath.points.length)));
  const startPoints = resampleBlendPoints(startPath.points, count, startPath.closed);
  let endPoints = resampleBlendPoints(endPath.points, count, endPath.closed);
  if (!startPoints.length || !endPoints.length || startPoints.length !== endPoints.length) return null;
  endPoints = alignBlendPointOrder(startPoints, endPoints, startPath.closed && endPath.closed);

  const points = [];
  for (let index = 0; index < startPoints.length; index++) {
    points.push({
      x: lerp(startPoints[index].x, endPoints[index].x, t),
      y: lerp(startPoints[index].y, endPoints[index].y, t)
    });
  }

  const closed = startPath.closed && endPath.closed;
  const bounds = blendPointBounds(points);
  const localPoints = translateBlendPoints(points, -bounds.x, -bounds.y);
  const pathData = blendPointsToPath(localPoints, closed);
  if (!pathData) return null;

  const vector = figma.createVector();
  vector.x = bounds.x;
  vector.y = bounds.y;
  try {
    vector.vectorPaths = [{ windingRule: "NONZERO", data: pathData }];
  } catch (_error) {
    vector.remove();
    return null;
  }
  applyBlendPathStyle(vector, start, end, t);
  return vector;
}

function sampleBlendPath(node, group) {
  if (!("width" in node) || !("height" in node)) return null;
  const toGroup = blendNodeToGroupTransform(node, group);

  try {
    if (Array.isArray(node.vectorPaths) && node.vectorPaths.length > 0 && node.vectorPaths[0].data) {
      return {
        points: transformBlendPoints(blendPathPoints(sampleSvgPath(node.vectorPaths[0].data, 24)), toGroup),
        closed: /[Zz]\s*$/.test(node.vectorPaths[0].data)
      };
    }
  } catch (_vectorPathError) {}

  try {
    const strokeGeometry = node.strokeGeometry;
    if (strokeGeometry && strokeGeometry.length > 0 && strokeGeometry[0].data) {
      return {
        points: transformBlendPoints(blendPathPoints(sampleSvgPath(strokeGeometry[0].data, 16)), toGroup),
        closed: /[Zz]\s*$/.test(strokeGeometry[0].data)
      };
    }
  } catch (_strokeGeometryError) {}

  try {
    const fillGeometry = node.fillGeometry;
    if (fillGeometry && fillGeometry.length > 0 && fillGeometry[0].data) {
      return {
        points: transformBlendPoints(blendPathPoints(sampleSvgPath(fillGeometry[0].data, 16)), toGroup),
        closed: /[Zz]\s*$/.test(fillGeometry[0].data)
      };
    }
  } catch (_fillGeometryError) {}

  return {
    points: transformBlendPoints(blendPathPoints(sampleRectOutline(node.width, node.height, blendCornerRadius(node), 24)), toGroup),
    closed: true
  };
}

function blendPathPoints(sampled) {
  const points = [];
  for (let index = 0; index < sampled.length; index++) {
    const point = sampled[index];
    if (point.type === "M" || point.type === "L") points.push({ x: point.x, y: point.y });
  }
  return points;
}

function blendCornerRadius(node) {
  if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
    return Math.min(node.cornerRadius, node.width / 2, node.height / 2);
  }
  return 0;
}

function resampleBlendPoints(points, count, closed) {
  if (!points.length || count <= 0) return [];
  if (points.length === 1) {
    const repeated = [];
    for (let index = 0; index < count; index++) repeated.push({ x: points[0].x, y: points[0].y });
    return repeated;
  }

  const segments = blendSegments(points, closed);
  const totalLength = segments.length ? segments[segments.length - 1].endLength : 0;
  if (totalLength <= 0) return points.slice(0, count);

  const result = [];
  const denominator = closed ? count : count - 1;
  for (let index = 0; index < count; index++) {
    const target = denominator <= 0 ? 0 : totalLength * index / denominator;
    result.push(pointAtBlendLength(segments, target));
  }
  return result;
}

function blendSegments(points, closed) {
  const segments = [];
  let length = 0;
  const max = closed ? points.length : points.length - 1;
  for (let index = 0; index < max; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);
    if (segmentLength <= 0) continue;
    length += segmentLength;
    segments.push({
      a: a,
      b: b,
      length: segmentLength,
      endLength: length
    });
  }
  return segments;
}

function pointAtBlendLength(segments, target) {
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const startLength = segment.endLength - segment.length;
    if (target <= segment.endLength || index === segments.length - 1) {
      const local = segment.length <= 0 ? 0 : (target - startLength) / segment.length;
      return {
        x: lerp(segment.a.x, segment.b.x, Math.max(0, Math.min(1, local))),
        y: lerp(segment.a.y, segment.b.y, Math.max(0, Math.min(1, local)))
      };
    }
  }
  const last = segments[segments.length - 1];
  return { x: last.b.x, y: last.b.y };
}

function alignBlendPointOrder(startPoints, endPoints, closed) {
  if (!startPoints.length || startPoints.length !== endPoints.length) return endPoints;
  if (!closed) return alignOpenBlendPoints(startPoints, endPoints);
  const forward = bestClosedBlendShift(startPoints, endPoints);
  const reversed = reverseBlendPoints(endPoints);
  const backward = bestClosedBlendShift(startPoints, reversed);
  return backward.score < forward.score ? backward.points : forward.points;
}

function alignOpenBlendPoints(startPoints, endPoints) {
  const normalScore = blendEndpointScore(startPoints, endPoints);
  const reversed = reverseBlendPoints(endPoints);
  const reversedScore = blendEndpointScore(startPoints, reversed);
  return reversedScore < normalScore ? reversed : endPoints;
}

function blendEndpointScore(startPoints, endPoints) {
  const last = startPoints.length - 1;
  return blendPointDistanceSquared(startPoints[0], endPoints[0]) + blendPointDistanceSquared(startPoints[last], endPoints[last]);
}

function bestClosedBlendShift(startPoints, endPoints) {
  let bestScore = Infinity;
  let bestOffset = 0;
  for (let offset = 0; offset < endPoints.length; offset++) {
    let score = 0;
    for (let index = 0; index < startPoints.length; index++) {
      score += blendPointDistanceSquared(startPoints[index], endPoints[(index + offset) % endPoints.length]);
    }
    if (score < bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  const points = [];
  for (let index = 0; index < endPoints.length; index++) {
    points.push(endPoints[(index + bestOffset) % endPoints.length]);
  }
  return { score: bestScore, points: points };
}

function reverseBlendPoints(points) {
  const result = [];
  for (let index = points.length - 1; index >= 0; index--) result.push(points[index]);
  return result;
}

function blendPointDistanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function blendPointBounds(points) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    x1 = Math.min(x1, point.x);
    y1 = Math.min(y1, point.y);
    x2 = Math.max(x2, point.x);
    y2 = Math.max(y2, point.y);
  }
  if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) {
    return { x: 0, y: 0, width: 0.01, height: 0.01 };
  }
  return { x: x1, y: y1, width: Math.max(0.01, x2 - x1), height: Math.max(0.01, y2 - y1) };
}

function translateBlendPoints(points, dx, dy) {
  const result = [];
  for (let index = 0; index < points.length; index++) {
    result.push({ x: points[index].x + dx, y: points[index].y + dy });
  }
  return result;
}

function transformBlendPoints(points, matrix) {
  const result = [];
  for (let index = 0; index < points.length; index++) {
    result.push(transformBlendPoint(points[index], matrix));
  }
  return result;
}

function blendNodeToGroupTransform(node, group) {
  try {
    if (group && group.absoluteTransform && node.absoluteTransform) {
      return multiplyBlendTransforms(invertBlendTransform(group.absoluteTransform), node.absoluteTransform);
    }
  } catch (_transformError) {}
  try {
    if (node.relativeTransform) return node.relativeTransform;
  } catch (_relativeError) {}
  return [[1, 0, node.x || 0], [0, 1, node.y || 0]];
}

function transformBlendPoint(point, matrix) {
  return {
    x: matrix[0][0] * point.x + matrix[0][1] * point.y + matrix[0][2],
    y: matrix[1][0] * point.x + matrix[1][1] * point.y + matrix[1][2]
  };
}

function invertBlendTransform(matrix) {
  const a = matrix[0][0];
  const c = matrix[0][1];
  const e = matrix[0][2];
  const b = matrix[1][0];
  const d = matrix[1][1];
  const f = matrix[1][2];
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 0.000001) return [[1, 0, 0], [0, 1, 0]];
  const invA = d / determinant;
  const invB = -b / determinant;
  const invC = -c / determinant;
  const invD = a / determinant;
  const invE = -(invA * e + invC * f);
  const invF = -(invB * e + invD * f);
  return [[invA, invC, invE], [invB, invD, invF]];
}

function multiplyBlendTransforms(a, b) {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2]
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2]
    ]
  ];
}

function blendPointsToPath(points, closed) {
  if (!points.length) return "";
  const parts = ["M " + blendRound(points[0].x) + " " + blendRound(points[0].y)];
  for (let index = 1; index < points.length; index++) {
    parts.push("L " + blendRound(points[index].x) + " " + blendRound(points[index].y));
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function blendRound(value) {
  return Math.round(value * 100) / 100;
}

function applyBlendPathStyle(node, start, end, t) {
  if ("opacity" in node && "opacity" in start && "opacity" in end) node.opacity = lerp(start.opacity, end.opacity, t);
  if ("blendMode" in node && "blendMode" in start && "blendMode" in end) node.blendMode = t < 0.5 ? start.blendMode : end.blendMode;
  interpolateNodePaints(node, start, end, t);
  interpolateStrokeWeight(node, start, end, t);
  interpolateStrokeStyle(node, start, end, t);
}

function interpolateNodePaints(node, start, end, t) {
  if ("fills" in node && Array.isArray(start.fills) && Array.isArray(end.fills)) {
    node.fills = interpolatePaintArray(start.fills, end.fills, t);
  }
  if ("strokes" in node && Array.isArray(start.strokes) && Array.isArray(end.strokes)) {
    node.strokes = interpolatePaintArray(start.strokes, end.strokes, t);
  }
}

function interpolatePaintArray(startPaints, endPaints, t) {
  const max = Math.max(startPaints.length, endPaints.length);
  const result = [];
  for (let index = 0; index < max; index++) {
    const startPaint = startPaints[index] || startPaints[startPaints.length - 1];
    const endPaint = endPaints[index] || endPaints[endPaints.length - 1];
    if (!startPaint && !endPaint) continue;
    const paint = interpolateBlendPaint(startPaint, endPaint, t);
    if (paint) result.push(paint);
  }
  return result;
}

function interpolateBlendPaint(startPaint, endPaint, t) {
  if (!startPaint && !endPaint) return null;
  if (!startPaint || !endPaint) return cloneSerializable(t < 0.5 ? startPaint : endPaint);
  if (startPaint.type === "SOLID" && endPaint.type === "SOLID") return interpolateSolidBlendPaint(startPaint, endPaint, t);
  if (isBlendGradientPaint(startPaint) || isBlendGradientPaint(endPaint)) return interpolateGradientBlendPaint(startPaint, endPaint, t);
  return cloneSerializable(t < 0.5 ? startPaint : endPaint);
}

function interpolateSolidBlendPaint(startPaint, endPaint, t) {
  const paint = cloneSerializable(startPaint);
  paint.color = {
    r: lerp(startPaint.color.r, endPaint.color.r, t),
    g: lerp(startPaint.color.g, endPaint.color.g, t),
    b: lerp(startPaint.color.b, endPaint.color.b, t)
  };
  paint.opacity = lerp(paintOpacity(startPaint), paintOpacity(endPaint), t);
  paint.visible = startPaint.visible !== false || endPaint.visible !== false;
  return paint;
}

function interpolateGradientBlendPaint(startPaint, endPaint, t) {
  const startGradient = isBlendGradientPaint(startPaint) ? startPaint : solidPaintAsGradient(startPaint, endPaint);
  const endGradient = isBlendGradientPaint(endPaint) ? endPaint : solidPaintAsGradient(endPaint, startPaint);
  if (!startGradient || !endGradient) return cloneSerializable(t < 0.5 ? startPaint : endPaint);

  const template = cloneSerializable(t < 0.5 ? startGradient : endGradient);
  template.type = startGradient.type === endGradient.type ? startGradient.type : (t < 0.5 ? startGradient.type : endGradient.type);
  template.gradientStops = interpolateGradientStops(startGradient, endGradient, t);
  template.gradientTransform = interpolateGradientTransform(startGradient.gradientTransform, endGradient.gradientTransform, t);
  template.visible = startPaint.visible !== false || endPaint.visible !== false;
  if ("opacity" in template) {
    delete template.opacity;
  }
  return template;
}

function isBlendGradientPaint(paint) {
  return paint && typeof paint.type === "string" && paint.type.indexOf("GRADIENT_") === 0 && Array.isArray(paint.gradientStops);
}

function solidPaintAsGradient(solidPaint, gradientTemplate) {
  if (!solidPaint || solidPaint.type !== "SOLID" || !isBlendGradientPaint(gradientTemplate)) return null;
  const template = cloneSerializable(gradientTemplate);
  const positions = gradientStopPositions(gradientTemplate);
  const color = {
    r: solidPaint.color.r,
    g: solidPaint.color.g,
    b: solidPaint.color.b,
    a: paintOpacity(solidPaint)
  };
  template.gradientStops = positions.map(function (position) {
    return {
      position: position,
      color: Object.assign({}, color)
    };
  });
  template.visible = solidPaint.visible !== false;
  return template;
}

function interpolateGradientStops(startPaint, endPaint, t) {
  const positions = mergeGradientStopPositions(startPaint, endPaint);
  const stops = [];
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    const startColor = gradientColorAt(startPaint, position);
    const endColor = gradientColorAt(endPaint, position);
    stops.push({
      position: position,
      color: {
        r: lerp(startColor.r, endColor.r, t),
        g: lerp(startColor.g, endColor.g, t),
        b: lerp(startColor.b, endColor.b, t),
        a: lerp(startColor.a, endColor.a, t)
      }
    });
  }
  return stops;
}

function mergeGradientStopPositions(startPaint, endPaint) {
  const map = { "0": 0, "1": 1 };
  const startPositions = gradientStopPositions(startPaint);
  const endPositions = gradientStopPositions(endPaint);
  for (let index = 0; index < startPositions.length; index++) {
    map[String(blendRound(startPositions[index]))] = startPositions[index];
  }
  for (let index = 0; index < endPositions.length; index++) {
    map[String(blendRound(endPositions[index]))] = endPositions[index];
  }
  const result = Object.keys(map).map(function (key) {
    return Math.max(0, Math.min(1, Number(map[key])));
  });
  result.sort(function (a, b) { return a - b; });
  return result;
}

function gradientStopPositions(paint) {
  if (!paint || !Array.isArray(paint.gradientStops) || !paint.gradientStops.length) return [0, 1];
  const positions = [];
  for (let index = 0; index < paint.gradientStops.length; index++) {
    const stop = paint.gradientStops[index];
    positions.push(typeof stop.position === "number" ? stop.position : index / Math.max(1, paint.gradientStops.length - 1));
  }
  return positions;
}

function gradientColorAt(paint, position) {
  if (!paint || !Array.isArray(paint.gradientStops) || !paint.gradientStops.length) {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  const stops = cloneSerializable(paint.gradientStops).sort(function (a, b) {
    return a.position - b.position;
  });
  if (position <= stops[0].position) return gradientStopColor(stops[0], paint);
  const last = stops[stops.length - 1];
  if (position >= last.position) return gradientStopColor(last, paint);
  for (let index = 1; index < stops.length; index++) {
    const before = stops[index - 1];
    const after = stops[index];
    if (position <= after.position) {
      const span = after.position - before.position;
      const local = span <= 0 ? 0 : (position - before.position) / span;
      const beforeColor = gradientStopColor(before, paint);
      const afterColor = gradientStopColor(after, paint);
      return {
        r: lerp(beforeColor.r, afterColor.r, local),
        g: lerp(beforeColor.g, afterColor.g, local),
        b: lerp(beforeColor.b, afterColor.b, local),
        a: lerp(beforeColor.a, afterColor.a, local)
      };
    }
  }
  return gradientStopColor(last, paint);
}

function gradientStopColor(stop, paint) {
  const color = stop && stop.color ? stop.color : { r: 0, g: 0, b: 0, a: 1 };
  const paintAlpha = typeof paint.opacity === "number" ? paint.opacity : 1;
  return {
    r: typeof color.r === "number" ? color.r : 0,
    g: typeof color.g === "number" ? color.g : 0,
    b: typeof color.b === "number" ? color.b : 0,
    a: (typeof color.a === "number" ? color.a : 1) * paintAlpha
  };
}

function interpolateGradientTransform(startTransform, endTransform, t) {
  if (!isBlendTransform(startTransform) && !isBlendTransform(endTransform)) return [[1, 0, 0], [0, 1, 0]];
  if (!isBlendTransform(startTransform)) return cloneSerializable(endTransform);
  if (!isBlendTransform(endTransform)) return cloneSerializable(startTransform);
  return [
    [
      lerp(startTransform[0][0], endTransform[0][0], t),
      lerp(startTransform[0][1], endTransform[0][1], t),
      lerp(startTransform[0][2], endTransform[0][2], t)
    ],
    [
      lerp(startTransform[1][0], endTransform[1][0], t),
      lerp(startTransform[1][1], endTransform[1][1], t),
      lerp(startTransform[1][2], endTransform[1][2], t)
    ]
  ];
}

function isBlendTransform(transform) {
  return Array.isArray(transform) && transform.length >= 2 && Array.isArray(transform[0]) && Array.isArray(transform[1]);
}

function interpolateStrokeWeight(node, start, end, t) {
  if (!("strokeWeight" in node) || !("strokeWeight" in start) || !("strokeWeight" in end)) return;
  if (typeof start.strokeWeight !== "number" || typeof end.strokeWeight !== "number") return;
  node.strokeWeight = lerp(start.strokeWeight, end.strokeWeight, t);
}

function interpolateStrokeStyle(node, start, end, t) {
  if ("strokeCap" in node && "strokeCap" in start && "strokeCap" in end) node.strokeCap = t < 0.5 ? start.strokeCap : end.strokeCap;
  if ("strokeJoin" in node && "strokeJoin" in start && "strokeJoin" in end) node.strokeJoin = t < 0.5 ? start.strokeJoin : end.strokeJoin;
  if ("strokeAlign" in node && "strokeAlign" in start && "strokeAlign" in end) node.strokeAlign = t < 0.5 ? start.strokeAlign : end.strokeAlign;
  if ("strokeMiterLimit" in node && "strokeMiterLimit" in start && "strokeMiterLimit" in end && typeof start.strokeMiterLimit === "number" && typeof end.strokeMiterLimit === "number") {
    node.strokeMiterLimit = lerp(start.strokeMiterLimit, end.strokeMiterLimit, t);
  }
  if ("dashPattern" in node && "dashPattern" in start && "dashPattern" in end) node.dashPattern = t < 0.5 ? cloneSerializable(start.dashPattern) : cloneSerializable(end.dashPattern);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function centerX(node) {
  return node.x + node.width / 2;
}

function centerY(node) {
  return node.y + node.height / 2;
}

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

async function updateBlendOptions(group, options) {
  const normalized = normalizeBlendOptions(Object.assign({}, readBlendOptions(group), options || {}));
  await renderBlend(group, normalized);
}

async function updateActiveBlend() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const selection = figma.currentPage.selection;
  const selectedEndpoint = selection.length === 1 && selection[0].getSharedPluginData(DATA_NAMESPACE, DATA_KIND) === KIND_BLEND_BASE ? selection[0] : null;
  await renderBlend(group, readBlendOptions(group));
  if (selectedEndpoint && selectedEndpoint.parent === group) {
    figma.currentPage.selection = [selectedEndpoint];
  } else {
    figma.currentPage.selection = [group];
  }
  figma.notify("Blend updated from endpoints.");
}

async function toggleBlendEndpointEditMode() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const options = readBlendOptions(group);
  options.editEndpoints = !options.editEndpoints;
  await renderBlend(group, options);
  figma.currentPage.selection = [group];
  figma.notify(options.editEndpoints ? "Blend endpoints are editable." : "Blend endpoints hidden.");
}

async function selectBlendEndpoint(role) {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const options = readBlendOptions(group);
  options.editEndpoints = true;
  await renderBlend(group, options);
  const endpoints = getBlendEndpoints(group);
  const endpoint = role === BLEND_ROLE_END ? endpoints.end : endpoints.start;
  if (!endpoint) return notifySelectBlend();
  endpoint.visible = true;
  endpoint.locked = false;
  figma.currentPage.selection = [endpoint];
  figma.notify(role === BLEND_ROLE_END ? "End endpoint selected." : "Start endpoint selected.");
}

async function releaseBlend() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const endpoints = getBlendEndpoints(group);
  if (!endpoints.start || !endpoints.end || !group.parent) return notifySelectBlend();
  clearBlendRenders(group);
  const parent = group.parent;
  const released = [endpoints.start, endpoints.end];
  for (let index = 0; index < released.length; index++) {
    restoreBlendNode(parent, group, released[index]);
  }
  group.remove();
  figma.currentPage.selection = released;
  figma.notify("Blend released.");
}

async function expandBlend() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  if (!group.parent) return notifySelectBlend();
  const options = readBlendOptions(group);
  options.editEndpoints = false;
  await renderBlend(group, options);
  const parent = group.parent;
  const expanded = [];
  for (const child of group.children.slice()) {
    const kind = child.getSharedPluginData(DATA_NAMESPACE, DATA_KIND);
    if (kind === KIND_BLEND_RENDER) {
      child.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, "");
      restoreBlendNode(parent, group, child);
      expanded.push(child);
    } else if (kind === KIND_BLEND_BASE) {
      child.remove();
    }
  }
  group.remove();
  figma.currentPage.selection = expanded;
  figma.notify("Blend expanded.");
}

function restoreBlendNode(parent, group, node) {
  const x = node.x;
  const y = node.y;
  node.visible = true;
  node.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, "");
  node.setSharedPluginData(DATA_NAMESPACE, DATA_BLEND_ROLE, "");
  parent.appendChild(node);
  node.x = group.x + x;
  node.y = group.y + y;
}

async function reverseBlendFrontToBack() {
  const group = getActiveBlendGroup();
  if (!group) return notifySelectBlend();
  const options = readBlendOptions(group);
  options.reverseFrontToBack = !options.reverseFrontToBack;
  await renderBlend(group, options);
  figma.notify("Blend front-to-back reversed.");
}

let savedSwatches = [];

async function loadSavedSwatches() {
  try {
    const stored = await figma.clientStorage.getAsync(SWATCH_STORAGE_KEY);
    savedSwatches = normalizeSwatches(stored);
  } catch (_error) {
    savedSwatches = [];
  }
  sendSelectionState();
}

async function writeSavedSwatches() {
  await figma.clientStorage.setAsync(SWATCH_STORAGE_KEY, savedSwatches);
}

function normalizeSwatches(value) {
  const source = Array.isArray(value) ? value : [];
  return source.map(normalizeSwatch).filter(Boolean);
}

function normalizeSwatch(swatch) {
  if (!swatch || typeof swatch !== "object") return null;
  const type = swatch.type === "gradient" ? "gradient" : swatch.type === "pattern" ? "pattern" : "solid";
  if (type === "pattern") {
    return {
      id: swatch.id || createId(),
      type: "pattern",
      name: swatch.name || "Pattern",
      pattern: swatch.pattern || null
    };
  }
  if (type === "gradient") {
    const stops = normalizeGradientStops(swatch.gradientStops, swatch.gradientStart || DEFAULT_FILL, swatch.gradientEnd || DEFAULT_GRADIENT_END);
    return {
      id: swatch.id || createId(),
      type: "gradient",
      name: swatch.name || "Gradient",
      paintType: normalizePaintType(swatch.paintType) === "SOLID" ? "GRADIENT_LINEAR" : normalizePaintType(swatch.paintType),
      gradientStart: stops[0].color,
      gradientEnd: stops[stops.length - 1].color,
      gradientStops: stops,
      gradientAngle: clampNumber(swatch.gradientAngle, -360, 360, 0)
    };
  }
  const color = normalizeHex(swatch.color || swatch.gradientStart || DEFAULT_FILL, DEFAULT_FILL);
  return {
    id: swatch.id || createId(),
    type: "solid",
    name: swatch.name || color,
    color: color
  };
}

function swatchFromLayer(layer) {
  if (!layer) return null;
  if (layer.paintType === "GRADIENT_LINEAR" || layer.paintType === "GRADIENT_RADIAL") {
    const stops = normalizeGradientStops(layer.gradientStops, layer.gradientStart, layer.gradientEnd);
    return normalizeSwatch({
      id: createId(),
      type: "gradient",
      name: layer.paintType === "GRADIENT_RADIAL" ? "Radial Gradient" : "Linear Gradient",
      paintType: layer.paintType,
      gradientStart: stops[0].color,
      gradientEnd: stops[stops.length - 1].color,
      gradientStops: stops,
      gradientAngle: layer.gradientAngle
    });
  }
  return normalizeSwatch({
    id: createId(),
    type: "solid",
    name: layer.color || DEFAULT_FILL,
    color: layer.color || DEFAULT_FILL
  });
}

function swatchFromPaint(paint, fallbackColor) {
  if (!paint || !PAINT_TYPES.includes(paint.type)) return null;
  const fields = paintToLayerFields(paint, fallbackColor || DEFAULT_FILL);
  if (fields.paintType === "GRADIENT_LINEAR" || fields.paintType === "GRADIENT_RADIAL") {
    return normalizeSwatch({
      id: createId(),
      type: "gradient",
      name: fields.paintType === "GRADIENT_RADIAL" ? "Radial Gradient" : "Linear Gradient",
      paintType: fields.paintType,
      gradientStart: fields.gradientStart,
      gradientEnd: fields.gradientEnd,
      gradientStops: fields.gradientStops,
      gradientAngle: fields.gradientAngle
    });
  }
  return normalizeSwatch({
    id: createId(),
    type: "solid",
    name: fields.color,
    color: fields.color
  });
}

function firstSelectionPaint(node) {
  if (!node) return null;
  if ("fills" in node && Array.isArray(node.fills)) {
    const fill = findSupportedPaint(node.fills);
    if (fill) return { paint: fill, fallback: DEFAULT_FILL };
  }
  if ("strokes" in node && Array.isArray(node.strokes)) {
    const stroke = findSupportedPaint(node.strokes);
    if (stroke) return { paint: stroke, fallback: DEFAULT_STROKE };
  }
  return null;
}

async function saveSwatchFromSelection() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    figma.notify("Select one object with a fill or stroke paint.");
    return;
  }
  const selectedPaint = firstSelectionPaint(selection[0]);
  if (!selectedPaint) {
    figma.notify("Selected object has no supported solid or gradient paint.");
    return;
  }
  const swatch = swatchFromPaint(selectedPaint.paint, selectedPaint.fallback);
  if (!swatch) return;
  savedSwatches.push(swatch);
  await writeSavedSwatches();
  figma.notify("Swatch saved from selection.");
}

async function saveSwatchFromLayer(layerId) {
  const group = getActiveAppearanceGroup();
  if (!group) return notifySelectAppearance();
  const stack = readStack(group);
  const layer = stack.find(function (item) {
    return item.id === layerId;
  });
  if (!layer) {
    figma.notify("Select a fill or stroke stack first.");
    return;
  }
  const swatch = swatchFromLayer(layer);
  if (!swatch) return;
  savedSwatches.push(swatch);
  await writeSavedSwatches();
  figma.notify("Swatch saved.");
}

async function createSavedSwatch(swatch) {
  const normalized = normalizeSwatch(Object.assign({}, swatch || {}, { id: createId() }));
  if (!normalized) return;
  savedSwatches.push(normalized);
  await writeSavedSwatches();
  figma.notify("Swatch saved.");
}

async function removeSavedSwatch(swatchId) {
  savedSwatches = savedSwatches.filter(function (swatch) {
    return swatch.id !== swatchId;
  });
  await writeSavedSwatches();
}

async function applySavedSwatch(layerId, swatchId) {
  const group = getActiveAppearanceGroup();
  if (!group) return notifySelectAppearance();
  const stack = readStack(group);
  const layerIndex = stack.findIndex(function (item) {
    return item.id === layerId;
  });
  if (layerIndex < 0) {
    figma.notify("Select a fill or stroke stack first.");
    return;
  }
  const swatch = savedSwatches.find(function (item) {
    return item.id === swatchId;
  });
  if (!swatch) {
    figma.notify("Swatch not found.");
    return;
  }
  if (swatch.type === "pattern") {
    figma.notify("Pattern swatches are reserved for future pattern paint support.");
    return;
  }
  stack[layerIndex] = applySwatchToLayer(stack[layerIndex], swatch);
  await renderAppearance(group, stack);
}

function applySwatchToLayer(layer, swatch) {
  if (swatch.type === "gradient") {
    const stops = normalizeGradientStops(swatch.gradientStops, swatch.gradientStart, swatch.gradientEnd);
    return normalizeLayer(Object.assign({}, layer, {
      paintType: swatch.paintType,
      color: stops[0].color,
      gradientStart: stops[0].color,
      gradientEnd: stops[stops.length - 1].color,
      gradientStops: stops,
      gradientAngle: swatch.gradientAngle
    }));
  }
  return normalizeLayer(Object.assign({}, layer, {
    paintType: "SOLID",
    color: swatch.color,
    gradientStart: swatch.color,
    gradientEnd: DEFAULT_GRADIENT_END,
    gradientStops: defaultGradientStops(swatch.color, DEFAULT_GRADIENT_END)
  }));
}

function readStack(group) {
  const raw = group.getSharedPluginData(DATA_NAMESPACE, DATA_STACK);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(normalizeLayer);
  } catch (_error) {
    return [];
  }
  return [];
}

function createGlobalAppearance(node) {
  return normalizeGlobalAppearance({
    opacity: node && "opacity" in node ? Math.round(node.opacity * 100) : 100,
    blendMode: node && "blendMode" in node ? node.blendMode : "NORMAL"
  });
}

function readGlobalAppearance(group) {
  const raw = group.getSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL);
  if (!raw) return createGlobalAppearance();
  try {
    return normalizeGlobalAppearance(JSON.parse(raw));
  } catch (_error) {
    return createGlobalAppearance();
  }
}

function writeGlobalAppearance(group, globalAppearance) {
  group.setSharedPluginData(DATA_NAMESPACE, DATA_GLOBAL, JSON.stringify(normalizeGlobalAppearance(globalAppearance)));
}

function normalizeGlobalAppearance(globalAppearance) {
  return {
    opacity: clampNumber(globalAppearance && globalAppearance.opacity, 0, 100, 100),
    blendMode: normalizeBlendMode(globalAppearance && globalAppearance.blendMode)
  };
}

function applyGlobalAppearance(group, globalAppearance) {
  const normalized = normalizeGlobalAppearance(globalAppearance);
  if ("opacity" in group) group.opacity = normalized.opacity / 100;
  if ("blendMode" in group) group.blendMode = normalized.blendMode;
}

function inferInitialStack(node) {
  const layers = [];
  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fills = node.fills.filter((paint) => PAINT_TYPES.includes(paint.type));
    for (const fill of fills) {
      layers.push(normalizeLayer(Object.assign({
        id: createId(),
        type: "fill",
        name: "Fill",
        opacity: Math.round((paintOpacity(fill) * 100)),
        blendMode: normalizeBlendMode(fill.blendMode || "NORMAL"),
        visible: fill.visible !== false
      }, paintToLayerFields(fill, DEFAULT_FILL))));
    }
  }

  if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const strokes = node.strokes.filter((paint) => PAINT_TYPES.includes(paint.type));
    for (const stroke of strokes) {
      layers.push(normalizeLayer(Object.assign({
        id: createId(),
        type: "stroke",
        name: "Stroke",
        opacity: Math.round((paintOpacity(stroke) * 100)),
        weight: "strokeWeight" in node && typeof node.strokeWeight === "number" ? node.strokeWeight : 2,
        blendMode: normalizeBlendMode(stroke.blendMode || "NORMAL"),
        strokeCap: "strokeCap" in node ? node.strokeCap : "",
        strokeJoin: "strokeJoin" in node ? node.strokeJoin : "",
        strokeAlign: "strokeAlign" in node ? node.strokeAlign : "",
        miterLimit: "strokeMiterLimit" in node ? node.strokeMiterLimit : "",
        dashPattern: "dashPattern" in node && Array.isArray(node.dashPattern) ? node.dashPattern : [],
        visible: stroke.visible !== false
      }, paintToLayerFields(stroke, DEFAULT_STROKE))));
    }
  }

  if (layers.length === 0) {
    layers.push(createLayer("fill"));
  }

  return layers;
}

function createLayer(type) {
  if (type === "stroke") {
    return normalizeLayer({
      id: createId(),
      type,
      name: "Stroke",
      paintType: "SOLID",
      color: DEFAULT_STROKE,
      gradientStart: DEFAULT_STROKE,
      gradientEnd: DEFAULT_GRADIENT_END,
      gradientStops: defaultGradientStops(DEFAULT_STROKE, DEFAULT_GRADIENT_END),
      gradientAngle: 0,
      opacity: 100,
      weight: 4,
      blendMode: "NORMAL",
      strokeCap: "",
      strokeJoin: "",
      strokeAlign: "",
      miterLimit: "",
      dashPattern: [],
      visible: true
    });
  }

  return normalizeLayer({
    id: createId(),
    type: "fill",
    name: "Fill",
    paintType: "SOLID",
    color: DEFAULT_FILL,
    gradientStart: DEFAULT_FILL,
    gradientEnd: DEFAULT_GRADIENT_END,
    gradientStops: defaultGradientStops(DEFAULT_FILL, DEFAULT_GRADIENT_END),
    gradientAngle: 0,
    opacity: 100,
    blendMode: "NORMAL",
    visible: true
  });
}

function reduceToBasic(stack) {
  const reduced = [];
  const fill = stack.find((layer) => layer.type === "fill");
  const stroke = stack.find((layer) => layer.type === "stroke");
  if (fill) reduced.push(normalizeLayer(Object.assign({}, fill, {
    id: createId(),
    effects: [],
    visible: true
  })));
  if (stroke) reduced.push(normalizeLayer(Object.assign({}, stroke, {
    id: createId(),
    effects: [],
    visible: true
  })));
  return reduced;
}

function cloneLayerForPaste(layer) {
  const clonedEffects = Array.isArray(layer.effects) ? layer.effects.map((effect) => Object.assign({}, effect, { id: createId() })) : [];
  return normalizeLayer(Object.assign({}, layer, {
    id: createId(),
    effects: clonedEffects
  }));
}

function normalizeLayer(layer) {
  const type = ["fill", "stroke"].includes(layer.type) ? layer.type : "fill";
  const effects = Array.isArray(layer.effects) ? layer.effects.map(normalizeEffect).filter(Boolean) : legacyEffects(layer);
  const fallbackColor = type === "stroke" ? DEFAULT_STROKE : DEFAULT_FILL;
  return {
    id: layer.id || createId(),
    type,
    name: typeof layer.name === "string" && layer.name.trim() ? layer.name.trim() : titleCase(type),
    paintType: normalizePaintType(layer.paintType),
    color: normalizeHex(layer.color || layer.gradientStart || fallbackColor, fallbackColor),
    gradientStart: normalizeHex(layer.gradientStart || layer.color || fallbackColor, fallbackColor),
    gradientEnd: normalizeHex(layer.gradientEnd || DEFAULT_GRADIENT_END, DEFAULT_GRADIENT_END),
    gradientStops: normalizeGradientStops(layer.gradientStops, layer.gradientStart || layer.color || fallbackColor, layer.gradientEnd || DEFAULT_GRADIENT_END),
    gradientAngle: clampNumber(layer.gradientAngle, -360, 360, 0),
    opacity: clampNumber(layer.opacity, 0, 100, 100),
    blendMode: normalizeBlendMode(layer.blendMode),
    weight: clampNumber(layer.weight, 0, 200, type === "stroke" ? 4 : 0),
    strokeCap: normalizeOptionalEnum(layer.strokeCap, STROKE_CAPS),
    strokeJoin: normalizeOptionalEnum(layer.strokeJoin, STROKE_JOINS),
    strokeAlign: normalizeOptionalEnum(layer.strokeAlign, STROKE_ALIGNS),
    miterLimit: layer.miterLimit === "" || layer.miterLimit === undefined ? "" : clampNumber(layer.miterLimit, 1, 100, 4),
    dashPattern: normalizeDashPattern(layer.dashPattern),
    offsetX: clampNumber(layer.offsetX, -500, 500, 0),
    offsetY: clampNumber(layer.offsetY, -500, 500, 8),
    radius: clampNumber(layer.radius, 0, 500, 18),
    spread: clampNumber(layer.spread, -500, 500, 0),
    effects,
    visible: layer.visible !== false
  };
}

function defaultGradientStops(start, end) {
  return [
    { id: createId(), position: 0, color: normalizeHex(start, DEFAULT_FILL) },
    { id: createId(), position: 100, color: normalizeHex(end, DEFAULT_GRADIENT_END) }
  ];
}

function normalizeGradientStops(stops, start, end) {
  const fallback = defaultGradientStops(start, end);
  const source = Array.isArray(stops) && stops.length ? stops : fallback;
  const normalized = source.map(function (stop, index) {
    const fallbackStop = fallback[Math.min(index, fallback.length - 1)] || fallback[0];
    return {
      id: stop && stop.id ? String(stop.id) : createId(),
      position: clampNumber(stop && stop.position, 0, 100, fallbackStop.position),
      color: normalizeHex(stop && stop.color, fallbackStop.color)
    };
  });
  normalized.sort(function (a, b) {
    return a.position - b.position;
  });
  if (normalized.length === 1) {
    normalized.push({ id: createId(), position: 100, color: normalized[0].color });
  }
  return normalized;
}

function legacyEffects(layer) {
  if (layer.type !== "shadow") return [];
  return [normalizeEffect({
    id: createId(),
    type: "dropShadow",
    color: layer.color || DEFAULT_SHADOW,
    opacity: layer.opacity || 28,
    offsetX: layer.offsetX || 0,
    offsetY: layer.offsetY || 8,
    radius: layer.radius || 18,
    spread: layer.spread || 0,
    visible: layer.visible !== false
  })];
}

function createEffect(type) {
  if (type === "outerGlow") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Outer Glow",
      color: "#7AB3FF",
      opacity: 65,
      offsetX: 0,
      offsetY: 0,
      radius: 18,
      spread: 0,
      blendMode: "SCREEN",
      showShadowBehindNode: true,
      visible: true
    });
  }

  if (type === "innerGlow") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Inner Glow",
      color: "#FFFFFF",
      opacity: 55,
      offsetX: 0,
      offsetY: 0,
      radius: 14,
      spread: 0,
      blendMode: "SCREEN",
      visible: true
    });
  }

  if (type === "transform") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Transform",
      scaleX: 100,
      scaleY: 100,
      moveX: 0,
      moveY: 0,
      rotate: 0,
      reflectX: false,
      reflectY: false,
      copies: 0,
      visible: true
    });
  }

  if (type === "offsetPath") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Offset Path",
      amount: 8,
      joinStyle: "MITER",
      miterLimit: 4,
      visible: true
    });
  }

  if (type === "warp") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Warp",
      warpStyle: "ARC",
      warpAxis: "HORIZONTAL",
      bend: 50,
      hDistort: 0,
      vDistort: 0,
      visible: true
    });
  }

  if (type === "roundCorners") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Round Corners",
      radius: 12,
      visible: true
    });
  }

  if (type === "feather") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Feather",
      radius: 8,
      visible: true
    });
  }

  if (type === "convertShape") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Convert to Shape",
      shapeType: "ROUNDED_RECTANGLE",
      widthExtra: 16,
      heightExtra: 8,
      cornerRadius: 8,
      visible: true
    });
  }

  if (type === "colorHalftone") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Color Halftone",
      color: DEFAULT_SHADOW,
      opacity: 45,
      dotSize: 5,
      spacing: 12,
      angle: 45,
      blendMode: "MULTIPLY",
      visible: true
    });
  }

  if (type === "scribble") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Scribble",
      color: DEFAULT_SHADOW,
      opacity: 65,
      strokeWidth: 1.2,
      gap: 8,
      angle: -15,
      jitter: 2,
      blendMode: "NORMAL",
      visible: true
    });
  }

  if (type === "innerShadow") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Inner Shadow",
      color: DEFAULT_SHADOW,
      opacity: 24,
      offsetX: 0,
      offsetY: 3,
      radius: 8,
      spread: 0,
      blendMode: "NORMAL",
      visible: true
    });
  }

  if (type === "layerBlur") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Layer Blur",
      radius: 8,
      visible: true
    });
  }

  if (type === "backgroundBlur") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Background Blur",
      radius: 12,
      visible: true
    });
  }

  if (type === "noise") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Noise",
      color: DEFAULT_SHADOW,
      secondaryColor: "#FFFFFF",
      opacity: 22,
      density: 45,
      noiseSize: 2,
      noiseType: "MONOTONE",
      blendMode: "NORMAL",
      visible: true
    });
  }

  if (type === "texture") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Texture",
      noiseSize: 2,
      radius: 4,
      clipToShape: true,
      visible: true
    });
  }

  if (type === "glass") {
    return normalizeEffect({
      id: createId(),
      type,
      name: "Glass",
      lightIntensity: 45,
      lightAngle: 45,
      refraction: 35,
      depth: 12,
      dispersion: 15,
      radius: 8,
      visible: true
    });
  }

  return normalizeEffect({
    id: createId(),
    type: "dropShadow",
    name: "Drop Shadow",
    color: DEFAULT_SHADOW,
    opacity: 28,
    offsetX: 0,
    offsetY: 8,
    radius: 18,
    spread: 0,
    blendMode: "NORMAL",
    showShadowBehindNode: false,
    visible: true
  });
}

function normalizeEffect(effect) {
  const incomingType = effect.type;
  if (![
    "dropShadow",
    "innerShadow",
    "outerGlow",
    "innerGlow",
    "layerBlur",
    "backgroundBlur",
    "noise",
    "texture",
    "glass",
    "transform",
    "offsetPath",
    "roundCorners",
    "feather",
    "convertShape",
    "colorHalftone",
    "scribble",
    "warp"
  ].includes(incomingType)) return null;
  const type = incomingType;
  return {
    id: effect.id || createId(),
    type,
    name: typeof effect.name === "string" && effect.name.trim() ? effect.name.trim() : effectName(type),
    color: normalizeHex(effect.color || DEFAULT_SHADOW),
    secondaryColor: normalizeHex(effect.secondaryColor || "#FFFFFF"),
    opacity: clampNumber(effect.opacity, 0, 100, defaultEffectOpacity(type)),
    blendMode: normalizeBlendMode(effect.blendMode),
    showShadowBehindNode: effect.showShadowBehindNode === true,
    offsetX: clampNumber(effect.offsetX, -500, 500, 0),
    offsetY: clampNumber(effect.offsetY, -500, 500, defaultEffectOffsetY(type)),
    radius: clampNumber(effect.radius, 0, 500, defaultEffectRadius(type)),
    spread: clampNumber(effect.spread, -500, 500, 0),
    noiseSize: clampNumber(effect.noiseSize, 0.1, 100, 2),
    density: clampNumber(effect.density, 0, 100, 45),
    noiseType: normalizeNoiseType(effect.noiseType),
    clipToShape: effect.clipToShape !== false,
    lightIntensity: clampNumber(effect.lightIntensity, 0, 100, 45),
    lightAngle: clampNumber(effect.lightAngle, 0, 360, 45),
    refraction: clampNumber(effect.refraction, 0, 100, 35),
    depth: clampNumber(effect.depth, 1, 1000, 12),
    dispersion: clampNumber(effect.dispersion, 0, 100, 15),
    scaleX: clampNumber(effect.scaleX, 1, 1000, 100),
    scaleY: clampNumber(effect.scaleY, 1, 1000, 100),
    moveX: clampNumber(effect.moveX, -5000, 5000, 0),
    moveY: clampNumber(effect.moveY, -5000, 5000, 0),
    rotate: clampNumber(effect.rotate, -3600, 3600, 0),
    reflectX: effect.reflectX === true,
    reflectY: effect.reflectY === true,
    copies: Math.round(clampNumber(effect.copies, 0, 100, 0)),
    amount: clampNumber(effect.amount, -500, 500, 8),
    joinStyle: normalizeOffsetJoin(effect.joinStyle),
    miterLimit: clampNumber(effect.miterLimit, 1, 100, 4),
    warpStyle: normalizeWarpStyle(effect.warpStyle),
    warpAxis: normalizeWarpAxis(effect.warpAxis),
    bend: clampNumber(effect.bend, -100, 100, 50),
    hDistort: clampNumber(effect.hDistort, -100, 100, 0),
    vDistort: clampNumber(effect.vDistort, -100, 100, 0),
    shapeType: normalizeShapeEffectType(effect.shapeType),
    widthExtra: clampNumber(effect.widthExtra, -5000, 5000, 0),
    heightExtra: clampNumber(effect.heightExtra, -5000, 5000, 0),
    cornerRadius: clampNumber(effect.cornerRadius, 0, 10000, 8),
    dotSize: clampNumber(effect.dotSize, 0.5, 200, 5),
    spacing: clampNumber(effect.spacing, 1, 500, 12),
    angle: clampNumber(effect.angle, -3600, 3600, 0),
    strokeWidth: clampNumber(effect.strokeWidth, 0.1, 100, 1.2),
    gap: clampNumber(effect.gap, 1, 500, 8),
    jitter: clampNumber(effect.jitter, 0, 100, 2),
    visible: effect.visible !== false
  };
}

// Warp effect: Arc, Arc Lower, Arc Upper, Flag, Rise
// Supports HORIZONTAL and VERTICAL axis like Illustrator

function applyWarpEffect(node, layer, effect) {
  const bend = Number(effect.bend) || 0;
  const hDistort = Number(effect.hDistort) || 0;
  const vDistort = Number(effect.vDistort) || 0;

  // Skip if no warp is applied
  if (bend === 0 && hDistort === 0 && vDistort === 0) return node;

  if (!("width" in node) || !("height" in node)) return node;
  const width = node.width;
  const height = node.height;
  if (width < 0.1 || height < 0.1) return node;

  // Sample the outline as a dense polygon
  const points = sampleNodeOutline(node, width, height);

  // Warp each point
  const warped = points.map(function (pt) {
    if (pt.type === "M" || pt.type === "L") {
      var wp = warpPoint(pt.x, pt.y, effect, width, height);
      return { type: pt.type, x: wp.x, y: wp.y };
    }
    return pt; // Z
  });

  // Build SVG path string
  var pathData = warpedPointsToPath(warped);

  // Create vector node
  var vector = figma.createVector();
  vector.name = node.name;
  if ("x" in node) vector.x = node.x;
  if ("y" in node) vector.y = node.y;

  try {
    vector.vectorPaths = [{ windingRule: "NONZERO", data: pathData }];
  } catch (_e) {
    vector.remove();
    return node;
  }

  // Copy visual properties from the render node
  try { if ("fills" in node && "fills" in vector) vector.fills = node.fills; } catch (_e) {}
  try { if ("strokes" in node && "strokes" in vector) vector.strokes = node.strokes; } catch (_e) {}
  try { if ("strokeWeight" in node && "strokeWeight" in vector) vector.strokeWeight = node.strokeWeight; } catch (_e) {}
  try { if ("strokeAlign" in node && "strokeAlign" in vector) vector.strokeAlign = node.strokeAlign; } catch (_e) {}
  try { if ("effects" in node && "effects" in vector) vector.effects = node.effects; } catch (_e) {}
  try { if ("opacity" in node) vector.opacity = node.opacity; } catch (_e) {}
  try { if ("blendMode" in node) vector.blendMode = node.blendMode; } catch (_e) {}

  // Mark as render node
  vector.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_RENDER);

  // Remove the original clone (it was created inside the group by createLayerRenderNode)
  node.remove();

  return vector;
}

// ─── Outline Sampling ──────────────────────────────────────────────────────

function sampleNodeOutline(node, width, height) {
  // Try fillGeometry first (works for vectors, boolean ops, etc.)
  try {
    var geo = node.fillGeometry;
    if (geo && geo.length > 0 && geo[0].data) {
      return sampleSvgPath(geo[0].data, 24);
    }
  } catch (_e) {}

  // Fall back to generating a rectangle outline (possibly with corner radius)
  var cr = 0;
  if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
    cr = Math.min(node.cornerRadius, width / 2, height / 2);
  }
  return sampleRectOutline(width, height, cr, 32);
}

function sampleRectOutline(w, h, cr, stepsPerEdge) {
  var points = [];
  if (cr <= 0) {
    // Simple rectangle: distribute points along each edge
    points.push({ type: "M", x: 0, y: 0 });
    for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w * i / stepsPerEdge, y: 0 });
    for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w, y: h * i / stepsPerEdge });
    for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w - w * i / stepsPerEdge, y: h });
    for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: 0, y: h - h * i / stepsPerEdge });
    points.push({ type: "Z" });
    return points;
  }

  // Rounded rectangle
  var r = cr;
  var cornerSteps = 8;
  points.push({ type: "M", x: r, y: 0 });

  // Top edge
  for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: r + (w - 2 * r) * i / stepsPerEdge, y: 0 });
  // Top-right corner
  for (var i = 1; i <= cornerSteps; i++) {
    var angle = -Math.PI / 2 + (Math.PI / 2) * i / cornerSteps;
    points.push({ type: "L", x: w - r + r * Math.cos(angle), y: r + r * Math.sin(angle) });
  }
  // Right edge
  for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w, y: r + (h - 2 * r) * i / stepsPerEdge });
  // Bottom-right corner
  for (var i = 1; i <= cornerSteps; i++) {
    var angle = 0 + (Math.PI / 2) * i / cornerSteps;
    points.push({ type: "L", x: w - r + r * Math.cos(angle), y: h - r + r * Math.sin(angle) });
  }
  // Bottom edge
  for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: w - r - (w - 2 * r) * i / stepsPerEdge, y: h });
  // Bottom-left corner
  for (var i = 1; i <= cornerSteps; i++) {
    var angle = Math.PI / 2 + (Math.PI / 2) * i / cornerSteps;
    points.push({ type: "L", x: r + r * Math.cos(angle), y: h - r + r * Math.sin(angle) });
  }
  // Left edge
  for (var i = 1; i <= stepsPerEdge; i++) points.push({ type: "L", x: 0, y: h - r - (h - 2 * r) * i / stepsPerEdge });
  // Top-left corner
  for (var i = 1; i <= cornerSteps; i++) {
    var angle = Math.PI + (Math.PI / 2) * i / cornerSteps;
    points.push({ type: "L", x: r + r * Math.cos(angle), y: r + r * Math.sin(angle) });
  }
  points.push({ type: "Z" });
  return points;
}

// ─── SVG Path Sampling ─────────────────────────────────────────────────────

function sampleSvgPath(data, stepsPerSegment) {
  var segments = parseSvgPathData(data);
  var abs = toAbsoluteSegments(segments);
  return subdivideSegments(abs, stepsPerSegment);
}

function parseSvgPathData(d) {
  var re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  var result = [];
  var m;
  while ((m = re.exec(d)) !== null) {
    var cmd = m[1];
    var nums = (m[2].match(/-?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?/gi) || []).map(Number);
    result.push({ cmd: cmd, args: nums });
  }
  return result;
}

function toAbsoluteSegments(segments) {
  var out = [];
  var cx = 0, cy = 0, startX = 0, startY = 0;
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    var cmd = seg.cmd;
    var a = seg.args;
    if (cmd === "M") { cx = a[0]; cy = a[1]; startX = cx; startY = cy; out.push({ cmd: "M", args: [cx, cy] }); }
    else if (cmd === "m") { cx += a[0]; cy += a[1]; startX = cx; startY = cy; out.push({ cmd: "M", args: [cx, cy] }); }
    else if (cmd === "L") { cx = a[0]; cy = a[1]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "l") { cx += a[0]; cy += a[1]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "H") { cx = a[0]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "h") { cx += a[0]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "V") { cy = a[0]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "v") { cy += a[0]; out.push({ cmd: "L", args: [cx, cy] }); }
    else if (cmd === "C") { out.push({ cmd: "C", args: a.slice(0, 6) }); cx = a[4]; cy = a[5]; }
    else if (cmd === "c") { out.push({ cmd: "C", args: [cx+a[0], cy+a[1], cx+a[2], cy+a[3], cx+a[4], cy+a[5]] }); cx += a[4]; cy += a[5]; }
    else if (cmd === "Q") {
      var qx = a[0], qy = a[1], ex = a[2], ey = a[3];
      out.push({ cmd: "C", args: [cx+2/3*(qx-cx), cy+2/3*(qy-cy), ex+2/3*(qx-ex), ey+2/3*(qy-ey), ex, ey] });
      cx = ex; cy = ey;
    }
    else if (cmd === "q") {
      var qx = cx+a[0], qy = cy+a[1], ex = cx+a[2], ey = cy+a[3];
      out.push({ cmd: "C", args: [cx+2/3*(qx-cx), cy+2/3*(qy-cy), ex+2/3*(qx-ex), ey+2/3*(qy-ey), ex, ey] });
      cx = ex; cy = ey;
    }
    else if (cmd === "Z" || cmd === "z") { out.push({ cmd: "Z", args: [] }); cx = startX; cy = startY; }
  }
  return out;
}

function subdivideSegments(segments, steps) {
  var out = [];
  var cx = 0, cy = 0;
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (seg.cmd === "M") { cx = seg.args[0]; cy = seg.args[1]; out.push({ type: "M", x: cx, y: cy }); continue; }
    if (seg.cmd === "Z") { out.push({ type: "Z" }); continue; }
    if (seg.cmd === "L") {
      var x2 = seg.args[0], y2 = seg.args[1];
      for (var j = 1; j <= steps; j++) {
        var t = j / steps;
        out.push({ type: "L", x: cx + t * (x2 - cx), y: cy + t * (y2 - cy) });
      }
      cx = x2; cy = y2; continue;
    }
    if (seg.cmd === "C") {
      var x1 = seg.args[0], y1 = seg.args[1], x2 = seg.args[2], y2 = seg.args[3], x3 = seg.args[4], y3 = seg.args[5];
      for (var j = 1; j <= steps; j++) {
        var t = j / steps;
        var mt = 1 - t;
        out.push({ type: "L",
          x: mt*mt*mt*cx + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3,
          y: mt*mt*mt*cy + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3
        });
      }
      cx = x3; cy = y3; continue;
    }
    out.push({ type: "L", x: cx, y: cy });
  }
  return out;
}

// ─── Warp Point Transform ──────────────────────────────────────────────────

function warpPoint(x, y, effect, width, height) {
  var bend = effect.bend / 100;
  var hd = effect.hDistort / 100;
  var vd = effect.vDistort / 100;
  var isH = effect.warpAxis === "HORIZONTAL";

  // Normalize to [0,1]
  var u0 = width > 0 ? x / width : 0;
  var v0 = height > 0 ? y / height : 0;

  // Primary axis (u) and secondary axis (v) depend on orientation
  var u = isH ? u0 : v0;
  var v = isH ? v0 : u0;

  var disp = warpDisplace(effect.warpStyle, u, v, bend);

  // Apply perspective distortion (trapezoid, not shear)
  // V Distort: scales width by vertical position — bottom wider, top narrower (positive)
  var du = disp.du + vd * (u - 0.5) * (2 * v - 1);
  // H Distort: scales height by horizontal position — right taller, left shorter (positive)
  var dv = disp.dv + hd * (v - 0.5) * (2 * u - 1);

  var newX, newY;
  if (isH) {
    newX = (u0 + du) * width;
    newY = (v0 + dv) * height;
  } else {
    newX = (u0 + dv) * width;
    newY = (v0 + du) * height;
  }

  return { x: newX, y: newY };
}

function warpDisplace(style, u, v, bend) {
  var arc = -bend * Math.sin(Math.PI * u) / 2;

  switch (style) {
    case "ARC":
      return { du: 0, dv: arc };
    case "ARC_LOWER":
      return { du: 0, dv: arc * v };
    case "ARC_UPPER":
      return { du: 0, dv: arc * (1 - v) };
    case "FLAG":
      return { du: 0, dv: -bend * Math.sin(2 * Math.PI * u) / 2 };
    case "RISE":
      return { du: 0, dv: -bend * u / 2 };
    default:
      return { du: 0, dv: 0 };
  }
}

// ─── Path Output ───────────────────────────────────────────────────────────

function warpedPointsToPath(points) {
  var parts = [];
  for (var i = 0; i < points.length; i++) {
    var pt = points[i];
    if (pt.type === "Z") { parts.push("Z"); continue; }
    parts.push(pt.type + " " + warpRound(pt.x) + " " + warpRound(pt.y));
  }
  return parts.join(" ");
}

function warpRound(n) {
  return Math.round(n * 100) / 100;
}

const OBJECT_PATH_SAMPLE_STEPS = 8;
const OBJECT_PATH_MAX_INPUT_POINTS = 1200;
const OBJECT_PATH_MAX_OUTPUT_POINTS = 1800;
const OBJECT_PATH_MAX_SMOOTH_ITERATIONS = 4;
let objectPathPreviewSession = null;
let lastObjectPathDebug = null;

async function simplifySelectedPath(tolerance) {
  const node = selectedVectorNode();
  if (!node) return;
  const amount = clampNumber(tolerance, 0, 100, 50);
  const result = transformVectorPathData(node, function (points, closed) {
    return simplifyPathPoints(points, amount, closed);
  });
  if (result) figma.notify("Path simplified.");
}

async function smoothSelectedPath(amount) {
  const node = selectedVectorNode();
  if (!node) return;
  const strength = clampNumber(amount, 0, 100, 50);
  const result = transformVectorPathData(node, function (points, closed) {
    return smoothPathPoints(points, strength, closed);
  });
  if (result) figma.notify("Path smoothed.");
}

async function startObjectPathPreview(tool, value) {
  const node = selectedVectorNode();
  if (!node) return false;
  lastObjectPathDebug = null;
  objectPathPreviewSession = {
    nodeId: node.id,
    tool: tool,
    originalVectorPaths: cloneVectorPaths(node.vectorPaths || [])
  };
  return await updateObjectPathPreview(value);
}

async function updateObjectPathPreview(value) {
  if (!objectPathPreviewSession) return false;
  const node = await figma.getNodeByIdAsync(objectPathPreviewSession.nodeId);
  if (!node || !("vectorPaths" in node)) {
    objectPathPreviewSession = null;
    lastObjectPathDebug = {
      tool: "",
      message: "Preview node was not found."
    };
    return false;
  }
  const transformed = transformVectorPaths(
    objectPathPreviewSession.originalVectorPaths,
    createObjectPathTransformer(objectPathPreviewSession.tool, value)
  );
  lastObjectPathDebug = buildObjectPathDebug(
    objectPathPreviewSession.tool,
    value,
    transformed ? transformed.debugEntries : [],
    transformed ? transformed.changed : false
  );
  if (!transformed || !transformed.changed) return false;
  try {
    node.vectorPaths = transformed.vectorPaths;
    return true;
  } catch (_error) {
    lastObjectPathDebug.message = "Figma rejected the transformed vectorPaths.";
    return false;
  }
}

function commitObjectPathPreview() {
  objectPathPreviewSession = null;
  if (lastObjectPathDebug) lastObjectPathDebug.message = "Applied current preview.";
}

async function cancelObjectPathPreview() {
  if (!objectPathPreviewSession) return false;
  const node = await figma.getNodeByIdAsync(objectPathPreviewSession.nodeId);
  if (!node || !("vectorPaths" in node)) {
    objectPathPreviewSession = null;
    return false;
  }
  try {
    node.vectorPaths = cloneVectorPaths(objectPathPreviewSession.originalVectorPaths);
    objectPathPreviewSession = null;
    if (lastObjectPathDebug) lastObjectPathDebug.message = "Preview cancelled and original path restored.";
    return true;
  } catch (_error) {
    objectPathPreviewSession = null;
    lastObjectPathDebug = {
      tool: "",
      message: "Could not restore original path."
    };
    return false;
  }
}

function readObjectPathDebug() {
  return lastObjectPathDebug;
}

function selectedVectorNode() {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    figma.notify("Select one vector path.");
    return null;
  }
  const node = selection[0];
  if (!("vectorPaths" in node) || !Array.isArray(node.vectorPaths) || !node.vectorPaths.length) {
    figma.notify("Select a vector path first.");
    return null;
  }
  return node;
}

function transformVectorPathData(node, transformPoints) {
  const transformed = transformVectorPaths(node.vectorPaths, transformPoints);
  if (!transformed || !transformed.changed) return false;
  try {
    node.vectorPaths = transformed.vectorPaths;
    return true;
  } catch (_error) {
    figma.notify("Could not update this path.");
    return false;
  }
}

function transformVectorPaths(vectorPaths, transformPoints) {
  const nextPaths = [];
  let changed = false;
  const debugEntries = [];
  for (let pathIndex = 0; pathIndex < vectorPaths.length; pathIndex++) {
    const vectorPath = vectorPaths[pathIndex];
    const subpaths = vectorPathToPointSubpaths(vectorPath.data);
    if (!subpaths.length) {
      nextPaths.push(cloneVectorPath(vectorPath));
      continue;
    }
    const pathParts = [];
    for (let subIndex = 0; subIndex < subpaths.length; subIndex++) {
      const subpath = subpaths[subIndex];
      const transformed = normalizeTransformedSubpath(transformPoints(subpath.points, subpath.closed), subpath.closed);
      debugEntries.push(describeSubpathTransform(subpath, transformed, pathIndex, subIndex));
      if (transformed.points.length >= 2) {
        pathParts.push(pathDataFromTransformedSubpath(transformed));
        changed = true;
      }
    }
    nextPaths.push({
      windingRule: vectorPath.windingRule || "NONZERO",
      data: pathParts.join(" ")
    });
  }
  return {
    changed: changed,
    vectorPaths: nextPaths,
    debugEntries: debugEntries
  };
}

function normalizeTransformedSubpath(value, closed) {
  if (Array.isArray(value)) {
    return {
      points: value,
      closed: closed,
      output: "lines",
      handleScale: 1 / 6,
      cornerDamping: 0.72,
      cornerCutoff: 0.92
    };
  }
  return {
    points: Array.isArray(value.points) ? value.points : [],
    curves: Array.isArray(value.curves) ? value.curves : [],
    closed: value.closed === undefined ? closed : value.closed,
    output: value.output || "lines",
    handleScale: value.handleScale === undefined ? 1 / 6 : value.handleScale,
    cornerDamping: value.cornerDamping === undefined ? 0.72 : value.cornerDamping,
    cornerCutoff: value.cornerCutoff === undefined ? 0.92 : value.cornerCutoff
  };
}

function pathDataFromTransformedSubpath(subpath) {
  if (subpath.output === "fit-curves") {
    return fitCurvesToSvgPath(subpath.curves, subpath.closed);
  }
  if (subpath.output === "cubic") {
    return cubicPathDataFromPoints(subpath.points, subpath.closed, subpath);
  }
  return pathPointsToSvgData(subpath.points, subpath.closed);
}

function createObjectPathTransformer(tool, value) {
  if (tool === "simplify") {
    const amount = clampNumber(value, 0, 100, 50);
    return function (points, closed) {
      return simplifyPathPoints(points, amount, closed);
    };
  }
  const strength = clampNumber(value, 0, 100, 50);
  return function (points, closed) {
    return smoothPathPoints(points, strength, closed);
  };
}

function vectorPathToPointSubpaths(data) {
  const sampled = sampleSvgPath(data, OBJECT_PATH_SAMPLE_STEPS);
  const subpaths = [];
  let current = null;
  for (let index = 0; index < sampled.length; index++) {
    const item = sampled[index];
    if (item.type === "M") {
      if (current && current.points.length) subpaths.push(current);
      current = { points: [{ x: item.x, y: item.y }], closed: false };
    } else if (item.type === "L") {
      if (!current) current = { points: [], closed: false };
      current.points.push({ x: item.x, y: item.y });
    } else if (item.type === "Z") {
      if (current) current.closed = true;
    }
  }
  if (current && current.points.length) subpaths.push(current);
  for (let subIndex = 0; subIndex < subpaths.length; subIndex++) {
    subpaths[subIndex].points = limitPathPointCount(subpaths[subIndex].points, OBJECT_PATH_MAX_INPUT_POINTS, subpaths[subIndex].closed);
  }
  return subpaths;
}

function simplifyPathPoints(points, tolerance, closed) {
  if (points.length <= 2) return points.slice();
  const work = limitPathPointCount(removeDuplicatePathPoints(points), OBJECT_PATH_MAX_INPUT_POINTS, closed);
  if (work.length <= 2) return work;
  const pathTolerance = simplifyToleranceForPoints(work, tolerance);
  if (pathTolerance <= 0.001) {
    return fitCurveSubpathFromPoints(work, closed, 1.5);
  }
  const simplified = simplifyPolylinePoints(work, pathTolerance, closed);
  return fitCurveSubpathFromPoints(simplified, closed, Math.max(1.5, pathTolerance * 0.9));
}

function smoothPathPoints(points, amount, closed) {
  const original = limitPathPointCount(removeDuplicatePathPoints(points), OBJECT_PATH_MAX_INPUT_POINTS, closed);
  if (original.length <= 2) return original;
  const strength = clampNumber(amount, 0, 100, 50);
  if (strength <= 0) return original.slice();
  const normalized = strength / 100;
  const iterations = Math.min(OBJECT_PATH_MAX_SMOOTH_ITERATIONS + 6, Math.max(1, Math.round(2 + normalized * 6)));
  const alpha = 0.24 + 0.52 * normalized;
  let result = original.slice();
  for (let index = 0; index < iterations; index++) {
    result = smoothPointSetOnce(result, closed, alpha);
    if (normalized >= 0.08) {
      result = straightenPointSetOnce(result, closed, 0.1 + normalized * 0.42);
    }
    if (result.length <= 2) break;
  }
  const simplifyTolerance = smoothToleranceForPoints(original, normalized);
  const simplified = simplifyTolerance > 0.001 ? simplifyPolylinePoints(result, simplifyTolerance, closed) : result;
  const fitError = Math.max(1.2, simplifyTolerance * 0.65);
  return fitCurveSubpathFromPoints(simplified, closed, fitError);
}

function rdpSimplify(points, tolerance) {
  if (points.length <= 2) return points.slice();
  let maxDistance = 0;
  let splitIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index++) {
    const distance = perpendicularDistance(points[index], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance > tolerance) {
    const left = rdpSimplify(points.slice(0, splitIndex + 1), tolerance);
    const right = rdpSimplify(points.slice(splitIndex), tolerance);
    return left.slice(0, left.length - 1).concat(right);
  }
  return [first, last];
}

function perpendicularDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return pathPointDistance(point, a);
  const numerator = Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x);
  return numerator / Math.sqrt(dx * dx + dy * dy);
}

function removeDuplicatePathPoints(points) {
  const result = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (!result.length || !samePathPoint(point, result[result.length - 1])) {
      result.push(point);
    }
  }
  return result;
}

function samePathPoint(a, b) {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function pathPointDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function simplifyToleranceForPoints(points, amount) {
  const bounds = pointBounds(points);
  const diagonal = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height);
  const precision = Math.max(0, Math.min(1, amount / 100));
  const reduction = 1 - precision;
  if (reduction <= 0.001) return 0;
  return diagonal * reduction * reduction * 0.12;
}

function pointBounds(points) {
  if (!points.length) {
    return { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return {
    minX: minX,
    minY: minY,
    maxX: maxX,
    maxY: maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function limitPathPointCount(points, maxPoints, closed) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points.slice();
  const safeMax = Math.max(closed ? 3 : 2, maxPoints);
  if (points.length <= safeMax) return points.slice();
  const limited = [];
  const lastIndex = points.length - 1;
  const step = lastIndex / (safeMax - 1);
  for (let index = 0; index < safeMax; index++) {
    let sourceIndex = Math.round(index * step);
    if (sourceIndex > lastIndex) sourceIndex = lastIndex;
    if (!limited.length || !samePathPoint(points[sourceIndex], limited[limited.length - 1])) {
      limited.push(points[sourceIndex]);
    }
  }
  if (closed && limited.length >= 2 && samePathPoint(limited[0], limited[limited.length - 1])) limited.pop();
  return limited;
}

function ensureMinimumPathPoints(points, fallback, closed) {
  const minimum = closed ? 3 : 2;
  if (points.length >= minimum) return points;
  return fallback.slice();
}

function resamplePathPoints(points, targetCount, closed) {
  if (targetCount <= 0 || points.length <= 1) return points.slice();
  if (points.length === targetCount) return points.slice();
  const source = closed ? points.concat([points[0]]) : points.slice();
  const lengths = [0];
  for (let index = 1; index < source.length; index++) {
    lengths[index] = lengths[index - 1] + pathPointDistance(source[index - 1], source[index]);
  }
  const total = lengths[lengths.length - 1];
  if (total <= 0.001) return limitPathPointCount(points, targetCount, closed);
  const result = [];
  const steps = closed ? targetCount : Math.max(1, targetCount - 1);
  for (let index = 0; index < targetCount; index++) {
    const distance = closed ? total * index / targetCount : total * index / steps;
    result.push(pointAtPathDistance(source, lengths, distance));
  }
  return result;
}

function pointAtPathDistance(points, lengths, distance) {
  if (distance <= 0) return clonePathPoint(points[0]);
  const lastIndex = lengths.length - 1;
  if (distance >= lengths[lastIndex]) return clonePathPoint(points[lastIndex]);
  for (let index = 1; index < lengths.length; index++) {
    if (distance > lengths[index]) continue;
    const span = lengths[index] - lengths[index - 1];
    const t = span <= 0 ? 0 : (distance - lengths[index - 1]) / span;
    return {
      x: points[index - 1].x + (points[index].x - points[index - 1].x) * t,
      y: points[index - 1].y + (points[index].y - points[index - 1].y) * t
    };
  }
  return clonePathPoint(points[lastIndex]);
}

function smoothPointSetOnce(points, closed, alpha) {
  if (points.length < 3) return points.slice();
  const result = points.map(function (point) {
    return clonePathPoint(point);
  });
  const startIndex = closed ? 0 : 1;
  const endIndex = closed ? points.length : points.length - 1;
  for (let index = startIndex; index < endIndex; index++) {
    const prev = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cornerFactor = pathCornerFactor(prev, current, next);
    const averaged = {
      x: prev.x * 0.25 + current.x * 0.5 + next.x * 0.25,
      y: prev.y * 0.25 + current.y * 0.5 + next.y * 0.25
    };
    const tangent = normalizePathVector({
      x: next.x - prev.x,
      y: next.y - prev.y
    });
    const normal = {
      x: -tangent.y,
      y: tangent.x
    };
    const delta = {
      x: averaged.x - current.x,
      y: averaged.y - current.y
    };
    const normalOffset = dotPathVector(delta, normal);
    const tangentOffset = dotPathVector(delta, tangent);
    const localAlpha = alpha * (0.35 + cornerFactor * 0.65);
    result[index] = {
      x: current.x + delta.x * localAlpha * 0.88 + normal.x * normalOffset * localAlpha * 0.35 + tangent.x * tangentOffset * localAlpha * 0.1,
      y: current.y + delta.y * localAlpha * 0.88 + normal.y * normalOffset * localAlpha * 0.35 + tangent.y * tangentOffset * localAlpha * 0.1
    };
  }
  return result;
}

function straightenPointSetOnce(points, closed, amount) {
  if (points.length < 3) return points.slice();
  const result = points.map(function (point) {
    return clonePathPoint(point);
  });
  const startIndex = closed ? 0 : 1;
  const endIndex = closed ? points.length : points.length - 1;
  for (let index = startIndex; index < endIndex; index++) {
    const prev = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const projected = projectPointToLine(current, prev, next);
    const midpoint = {
      x: (prev.x + next.x) * 0.5,
      y: (prev.y + next.y) * 0.5
    };
    const target = {
      x: projected.x * 0.72 + midpoint.x * 0.28,
      y: projected.y * 0.72 + midpoint.y * 0.28
    };
    const cornerWeight = 0.28 + pathCornerFactor(prev, current, next) * 0.72;
    result[index] = {
      x: current.x + (target.x - current.x) * amount * cornerWeight,
      y: current.y + (target.y - current.y) * amount * cornerWeight
    };
  }
  return result;
}

function pathCornerFactor(prev, current, next) {
  const ax = current.x - prev.x;
  const ay = current.y - prev.y;
  const bx = next.x - current.x;
  const by = next.y - current.y;
  const aLen = Math.sqrt(ax * ax + ay * ay);
  const bLen = Math.sqrt(bx * bx + by * by);
  if (aLen <= 0.001 || bLen <= 0.001) return 0;
  const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLen * bLen)));
  return Math.max(0, Math.min(1, (1 - cos) / 2));
}

function smoothToleranceForPoints(points, normalized) {
  const bounds = pointBounds(points);
  const diagonal = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height);
  return diagonal * normalized * normalized * 0.06;
}

function simplifyPolylinePoints(points, tolerance, closed) {
  let work = points.slice();
  if (closed) {
    work = ensureClosedPolyline(points);
  }
  const simplified = simplifyPathLib(work, tolerance, true);
  if (closed) {
    const opened = simplified.slice();
    if (opened.length > 1 && samePathPoint(opened[0], opened[opened.length - 1])) opened.pop();
    return ensureMinimumPathPoints(opened, points, true);
  }
  return ensureMinimumPathPoints(simplified, points, false);
}

function fitCurveSubpathFromPoints(points, closed, error) {
  const safePoints = limitPathPointCount(removeDuplicatePathPoints(points), OBJECT_PATH_MAX_OUTPUT_POINTS, closed);
  const minimum = closed ? 3 : 2;
  if (safePoints.length < minimum) {
    return {
      points: points.slice(),
      curves: [],
      closed: closed,
      output: "lines"
    };
  }
  let fitPoints = safePoints.slice();
  if (closed) fitPoints = ensureClosedPolyline(safePoints);
  const fitInput = fitPoints.map(function (point) {
    return [point.x, point.y];
  });
  try {
    const curves = fitCurve(fitInput, error);
    if (!curves || !curves.length) {
      return {
        points: safePoints,
        curves: [],
        closed: closed,
        output: "lines"
      };
    }
    return {
      points: closed && fitPoints.length > 1 ? fitPoints.slice(0, fitPoints.length - 1) : fitPoints,
      curves: curves,
      closed: closed,
      output: "fit-curves"
    };
  } catch (_error) {
    return {
      points: safePoints,
      curves: [],
      closed: closed,
      output: "lines"
    };
  }
}

function ensureClosedPolyline(points) {
  const result = points.slice();
  if (!result.length) return result;
  if (!samePathPoint(result[0], result[result.length - 1])) {
    result.push(clonePathPoint(result[0]));
  }
  return result;
}

function projectPointToLine(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 0.00001) return clonePathPoint(point);
  const t = ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq;
  return {
    x: a.x + abx * t,
    y: a.y + aby * t
  };
}

function fitCurvesToSvgPath(curves, closed) {
  if (!curves || !curves.length) return "";
  const first = curves[0][0];
  const parts = ["M " + objectPathRound(first[0]) + " " + objectPathRound(first[1])];
  for (let index = 0; index < curves.length; index++) {
    const curve = curves[index];
    parts.push(
      "C " +
      objectPathRound(curve[1][0]) + " " + objectPathRound(curve[1][1]) + " " +
      objectPathRound(curve[2][0]) + " " + objectPathRound(curve[2][1]) + " " +
      objectPathRound(curve[3][0]) + " " + objectPathRound(curve[3][1])
    );
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function cubicPathDataFromPoints(points, closed, options) {
  if (!points.length) return "";
  if (points.length < 3) return pathPointsToSvgData(points, closed);
  const handleScaleBase = options && options.handleScale !== undefined ? options.handleScale : 1 / 6;
  const cornerDamping = options && options.cornerDamping !== undefined ? options.cornerDamping : 0.72;
  const cornerCutoff = options && options.cornerCutoff !== undefined ? options.cornerCutoff : 0.92;
  const parts = ["M " + objectPathRound(points[0].x) + " " + objectPathRound(points[0].y)];
  if (closed) {
    for (let index = 0; index < points.length; index++) {
      const prev = points[(index - 1 + points.length) % points.length];
      const current = points[index];
      const next = points[(index + 1) % points.length];
      const after = points[(index + 2) % points.length];
      const currentCorner = pathCornerFactor(prev, current, next);
      const nextCorner = pathCornerFactor(current, next, after);
      const currentScale = handleScaleBase * (1 - currentCorner * cornerDamping);
      const nextScale = handleScaleBase * (1 - nextCorner * cornerDamping);
      const cp1 = {
        x: current.x + (next.x - prev.x) * currentScale,
        y: current.y + (next.y - prev.y) * currentScale
      };
      const cp2 = {
        x: next.x - (after.x - current.x) * nextScale,
        y: next.y - (after.y - current.y) * nextScale
      };
      if (pathCornerFactor(prev, current, next) > cornerCutoff) {
        parts.push("L " + objectPathRound(next.x) + " " + objectPathRound(next.y));
        continue;
      }
      parts.push(
        "C " +
        objectPathRound(cp1.x) + " " + objectPathRound(cp1.y) + " " +
        objectPathRound(cp2.x) + " " + objectPathRound(cp2.y) + " " +
        objectPathRound(next.x) + " " + objectPathRound(next.y)
      );
    }
    parts.push("Z");
    return parts.join(" ");
  }
  for (let index = 0; index < points.length - 1; index++) {
    const prev = index === 0 ? points[index] : points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const after = index + 2 >= points.length ? points[index + 1] : points[index + 2];
    const currentCorner = index === 0 ? 0 : pathCornerFactor(prev, current, next);
    const nextCorner = index + 1 >= points.length - 1 ? 0 : pathCornerFactor(current, next, after);
    const currentScale = handleScaleBase * (1 - currentCorner * cornerDamping);
    const nextScale = handleScaleBase * (1 - nextCorner * cornerDamping);
    const cp1 = {
      x: current.x + (next.x - prev.x) * currentScale,
      y: current.y + (next.y - prev.y) * currentScale
    };
    const cp2 = {
      x: next.x - (after.x - current.x) * nextScale,
      y: next.y - (after.y - current.y) * nextScale
    };
    if (Math.max(currentCorner, nextCorner) > cornerCutoff) {
      parts.push("L " + objectPathRound(next.x) + " " + objectPathRound(next.y));
      continue;
    }
    parts.push(
      "C " +
      objectPathRound(cp1.x) + " " + objectPathRound(cp1.y) + " " +
      objectPathRound(cp2.x) + " " + objectPathRound(cp2.y) + " " +
      objectPathRound(next.x) + " " + objectPathRound(next.y)
    );
  }
  return parts.join(" ");
}

function cloneVectorPaths(vectorPaths) {
  return (vectorPaths || []).map(function (vectorPath) {
    return cloneVectorPath(vectorPath);
  });
}

function cloneVectorPath(vectorPath) {
  return {
    windingRule: vectorPath.windingRule || "NONZERO",
    data: vectorPath.data || ""
  };
}

function clonePathPoint(point) {
  return { x: point.x, y: point.y };
}

function normalizePathVector(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length <= 0.00001) {
    return { x: 1, y: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function dotPathVector(a, b) {
  return a.x * b.x + a.y * b.y;
}

function describeSubpathTransform(original, transformed, pathIndex, subIndex) {
  const before = original.points || [];
  const after = transformed.points || [];
  const count = Math.min(before.length, after.length);
  let maxDelta = 0;
  let totalDelta = 0;
  for (let index = 0; index < count; index++) {
    const delta = pathPointDistance(before[index], after[index]);
    totalDelta += delta;
    if (delta > maxDelta) maxDelta = delta;
  }
  const beforeBounds = pointBounds(before);
  const afterBounds = pointBounds(after);
  return {
    pathIndex: pathIndex,
    subIndex: subIndex,
    beforeCount: before.length,
    afterCount: after.length,
    maxDelta: maxDelta,
    avgDelta: count ? totalDelta / count : 0,
    beforeBounds: beforeBounds,
    afterBounds: afterBounds,
    output: transformed.output || "lines"
  };
}

function buildObjectPathDebug(tool, value, entries, changed) {
  const summary = {
    tool: tool,
    value: value,
    changed: changed,
    pathCount: entries.length,
    beforeCount: 0,
    afterCount: 0,
    maxDelta: 0,
    avgDelta: 0,
    output: "",
    beforeBounds: null,
    afterBounds: null,
    message: changed ? "Geometry changed." : "No geometry change detected."
  };
  if (!entries.length) {
    summary.message = "No subpaths were sampled from the current vector path.";
    return summary;
  }
  let deltaSum = 0;
  let deltaSamples = 0;
  const beforePoints = [];
  const afterPoints = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    summary.beforeCount += entry.beforeCount;
    summary.afterCount += entry.afterCount;
    if (entry.maxDelta > summary.maxDelta) summary.maxDelta = entry.maxDelta;
    deltaSum += entry.avgDelta * Math.max(1, Math.min(entry.beforeCount, entry.afterCount));
    deltaSamples += Math.max(1, Math.min(entry.beforeCount, entry.afterCount));
    if (!summary.output) summary.output = entry.output;
    beforePoints.push({ x: entry.beforeBounds.minX, y: entry.beforeBounds.minY });
    beforePoints.push({ x: entry.beforeBounds.maxX, y: entry.beforeBounds.maxY });
    afterPoints.push({ x: entry.afterBounds.minX, y: entry.afterBounds.minY });
    afterPoints.push({ x: entry.afterBounds.maxX, y: entry.afterBounds.maxY });
  }
  summary.avgDelta = deltaSamples ? deltaSum / deltaSamples : 0;
  summary.beforeBounds = pointBounds(beforePoints);
  summary.afterBounds = pointBounds(afterPoints);
  if (summary.maxDelta < 0.01 && summary.beforeCount === summary.afterCount) {
    summary.message = "Path is effectively unchanged. Smooth is not moving sampled points enough.";
  } else if (summary.maxDelta < 0.01) {
    summary.message = "Point count changed, but coordinates barely moved.";
  } else if (summary.beforeCount !== summary.afterCount) {
    summary.message = "Point count changed and geometry moved.";
  }
  return summary;
}

function pathPointsToSvgData(points, closed) {
  if (!points.length) return "";
  const parts = ["M " + objectPathRound(points[0].x) + " " + objectPathRound(points[0].y)];
  for (let index = 1; index < points.length; index++) {
    parts.push("L " + objectPathRound(points[index].x) + " " + objectPathRound(points[index].y));
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

function objectPathRound(value) {
  return Math.round(value * 100) / 100;
}

let didNotifyUnsupportedBetaEffects = false;
const noiseImageCache = {};
const rasterImageCache = {};

function createLayerRenderNode(base, layer) {
  const shapeEffect = firstVisibleEffect(layer, "convertShape");
  if (!shapeEffect || !("width" in base) || !("height" in base)) return base.clone();

  const node = shapeEffect.shapeType === "ELLIPSE" ? figma.createEllipse() : figma.createRectangle();
  const width = Math.max(0.01, base.width + shapeEffect.widthExtra);
  const height = Math.max(0.01, base.height + shapeEffect.heightExtra);
  node.name = effectName(shapeEffect.type);
  node.x = "x" in base ? base.x - shapeEffect.widthExtra / 2 : 0;
  node.y = "y" in base ? base.y - shapeEffect.heightExtra / 2 : 0;
  if ("resize" in node) node.resize(width, height);
  if ("rotation" in node && "rotation" in base) node.rotation = base.rotation;
  if ("cornerRadius" in node) {
    node.cornerRadius = shapeEffect.shapeType === "ROUNDED_RECTANGLE" ? shapeEffect.cornerRadius : 0;
  }
  return node;
}

function firstVisibleEffect(layer, type) {
  const effects = layer.effects || [];
  for (const effect of effects) {
    if (effect.visible && effect.type === type) return effect;
  }
  return null;
}

function applyLayerAppearance(node, layer, base) {
  node.opacity = 1;
  node.blendMode = layer.blendMode;
  if ("effects" in node) node.effects = [];

  if (layer.type === "fill") {
    if ("fills" in node) node.fills = [layerPaint(layer)];
    if ("strokes" in node) node.strokes = [];
    applyLayerEffects(node, layer);
    return;
  }

  if (layer.type === "stroke") {
    if ("fills" in node) node.fills = [];
    if ("strokes" in node) node.strokes = [layerPaint(layer)];
    if ("strokeWeight" in node) node.strokeWeight = layer.weight;
    applyStrokeStyle(node, layer);
    applyLayerEffects(node, layer);
    return;
  }
}

function applyStrokeStyle(node, layer) {
  if ("strokeCap" in node && layer.strokeCap) node.strokeCap = layer.strokeCap;
  if ("strokeJoin" in node && layer.strokeJoin) node.strokeJoin = layer.strokeJoin;
  if ("strokeAlign" in node && layer.strokeAlign) node.strokeAlign = layer.strokeAlign;
  if ("strokeMiterLimit" in node && layer.miterLimit !== "") node.strokeMiterLimit = layer.miterLimit;
  if ("dashPattern" in node) node.dashPattern = layer.dashPattern;
}

function applyLayerEffects(node, layer) {
  const figmaEffects = [];
  for (const effect of layer.effects) {
    if (!effect.visible) continue;

    if (effect.type === "dropShadow" || effect.type === "outerGlow") {
      const isGlow = effect.type === "outerGlow";
      figmaEffects.push({
        type: "DROP_SHADOW",
        visible: true,
        color: Object.assign({}, hexToRgb(effect.color), { a: effect.opacity / 100 }),
        offset: { x: isGlow ? 0 : effect.offsetX, y: isGlow ? 0 : effect.offsetY },
        radius: effect.radius,
        spread: effect.spread,
        blendMode: effect.blendMode,
        showShadowBehindNode: effect.showShadowBehindNode
      });
    }

    if (effect.type === "innerShadow" || effect.type === "innerGlow") {
      const isGlow = effect.type === "innerGlow";
      figmaEffects.push({
        type: "INNER_SHADOW",
        visible: true,
        color: Object.assign({}, hexToRgb(effect.color), { a: effect.opacity / 100 }),
        offset: { x: isGlow ? 0 : effect.offsetX, y: isGlow ? 0 : effect.offsetY },
        radius: effect.radius,
        spread: effect.spread,
        blendMode: effect.blendMode
      });
    }

    if (effect.type === "layerBlur") {
      figmaEffects.push({
        type: "LAYER_BLUR",
        visible: true,
        radius: effect.radius
      });
    }

    if (effect.type === "backgroundBlur") {
      figmaEffects.push({
        type: "BACKGROUND_BLUR",
        visible: true,
        radius: effect.radius
      });
    }

    if (effect.type === "feather") {
      figmaEffects.push({
        type: "LAYER_BLUR",
        visible: true,
        radius: effect.radius
      });
    }

    if (effect.type === "texture") {
      figmaEffects.push({
        type: "TEXTURE",
        visible: true,
        noiseSize: effect.noiseSize,
        radius: effect.radius,
        clipToShape: effect.clipToShape,
        boundVariables: {}
      });
    }

    if (effect.type === "glass") {
      figmaEffects.push({
        type: "GLASS",
        visible: true,
        lightIntensity: effect.lightIntensity / 100,
        lightAngle: effect.lightAngle,
        refraction: effect.refraction / 100,
        depth: effect.depth,
        dispersion: effect.dispersion / 100,
        radius: effect.radius,
        boundVariables: {}
      });
    }
  }

  if ("effects" in node) {
    assignEffects(node, figmaEffects);
  }
}

function applyGeometryPipelineEffects(node, layer) {
  const warpEffect = firstVisibleEffect(layer, "warp");
  if (warpEffect) {
    const warped = applyWarpEffect(node, layer, warpEffect);
    if (warped) node = warped;
  }

  const offsetEffect = firstVisibleEffect(layer, "offsetPath");
  if (offsetEffect) {
    const offsetNode = applyOffsetPathEffect(node, layer, offsetEffect);
    if (offsetNode) node = offsetNode;
  }

  const roundEffect = firstVisibleEffect(layer, "roundCorners");
  if (roundEffect && "cornerRadius" in node) {
    node.cornerRadius = roundEffect.radius;
  }

  return node;
}

function applyOffsetPathEffect(node, layer, effect) {
  const amount = Number(effect.amount) || 0;
  if (amount === 0) return node;

  if (layer.type === "fill" && amount > 0 && "strokes" in node) {
    // Positive offset on fill: expand via outside stroke
    const paint = node.fills && node.fills.length ? clonePaint(node.fills[0]) : layerPaint(layer);
    node.strokes = [paint];
    if ("strokeWeight" in node) node.strokeWeight = amount * 2;
    if ("strokeAlign" in node) node.strokeAlign = "OUTSIDE";
    applyOffsetJoinStyle(node, effect);
    return node;
  }

  if (amount < 0) {
    // Negative offset: shrink width/height
    resizeNodeByOffset(node, amount);
    // Simulate join style via cornerRadius
    if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
      const absAmount = Math.abs(amount);
      if (effect.joinStyle === "ROUND") {
        // Round: set cornerRadius to |amount| to create natural inward rounding
        node.cornerRadius = absAmount;
      } else if (effect.joinStyle === "BEVEL") {
        // Bevel: approximate with a small cornerRadius (less than amount)
        node.cornerRadius = Math.round(absAmount * 0.4);
      } else {
        // MITER (default): keep existing cornerRadius, reduced by inset amount
        node.cornerRadius = Math.max(0, node.cornerRadius + amount);
      }
    }
    return node;
  }

  resizeNodeByOffset(node, amount);
  applyOffsetJoinStyle(node, effect);
  return node;
}

function applyOffsetJoinStyle(node, effect) {
  if ("strokeJoin" in node) node.strokeJoin = effect.joinStyle;
  if ("strokeMiterLimit" in node && effect.joinStyle === "MITER") node.strokeMiterLimit = effect.miterLimit;
}

function resizeNodeByOffset(node, amount) {
  if (!("width" in node) || !("height" in node) || !("resize" in node)) return;
  const nextWidth = Math.max(0.01, node.width + amount * 2);
  const nextHeight = Math.max(0.01, node.height + amount * 2);
  if ("x" in node) node.x -= amount;
  if ("y" in node) node.y -= amount;
  try {
    node.resize(nextWidth, nextHeight);
  } catch (_error) {
    try {
      node.resizeWithoutConstraints(nextWidth, nextHeight);
    } catch (_innerError) {
      // Some nodes cannot be resized by plugins.
    }
  }
}

function appendRasterEffectOverlays(group, base, layer, transform) {
  const rasterEffects = layer.effects.filter((effect) => {
    return effect.visible && (effect.type === "noise" || effect.type === "colorHalftone" || effect.type === "scribble");
  });
  if (!rasterEffects.length) return;

  for (const effect of rasterEffects) {
    let overlay = createLayerRenderNode(base, layer);
    overlay.name = `${layer.name} ${effect.name}`;
    overlay.visible = true;
    overlay.locked = false;
    overlay.setSharedPluginData(DATA_NAMESPACE, DATA_KIND, KIND_RENDER);
    applyRasterOverlayAppearance(overlay, layer, effect);
    overlay = applyGeometryPipelineEffects(overlay, layer);
    applyTransformInstance(overlay, transform);
    group.appendChild(overlay);
  }
}

function applyRasterOverlayAppearance(node, layer, effect) {
  node.opacity = 1;
  node.blendMode = effect.blendMode;
  if ("effects" in node) node.effects = [];

  const paint = rasterImagePaint(effect);
  if (layer.type === "fill") {
    if ("fills" in node) node.fills = [paint];
    if ("strokes" in node) node.strokes = [];
    return;
  }

  if (layer.type === "stroke") {
    if ("fills" in node) node.fills = [];
    if ("strokes" in node) node.strokes = [paint];
    if ("strokeWeight" in node) node.strokeWeight = layer.weight;
    applyStrokeStyle(node, layer);
  }
}

function rasterImagePaint(effect) {
  if (effect.type === "colorHalftone") return halftoneImagePaint(effect);
  if (effect.type === "scribble") return scribbleImagePaint(effect);
  return noiseImagePaint(effect);
}

function noiseImagePaint(effect) {
  return {
    type: "IMAGE",
    visible: true,
    scaleMode: "TILE",
    imageHash: noiseImageHash(effect),
    scalingFactor: 1,
    opacity: effect.opacity / 100,
    blendMode: effect.blendMode
  };
}

function noiseImageHash(effect) {
  const key = [
    effect.noiseType,
    effect.color,
    effect.secondaryColor,
    effect.density,
    effect.noiseSize
  ].join("|");
  if (!noiseImageCache[key]) {
    noiseImageCache[key] = figma.createImage(createNoisePng(effect)).hash;
  }
  return noiseImageCache[key];
}

function halftoneImagePaint(effect) {
  return {
    type: "IMAGE",
    visible: true,
    scaleMode: "TILE",
    imageHash: halftoneImageHash(effect),
    scalingFactor: 1,
    opacity: effect.opacity / 100,
    blendMode: effect.blendMode
  };
}

function halftoneImageHash(effect) {
  const key = [
    "halftone",
    effect.color,
    effect.dotSize,
    effect.spacing,
    effect.angle
  ].join("|");
  if (!rasterImageCache[key]) {
    rasterImageCache[key] = figma.createImage(createHalftonePng(effect)).hash;
  }
  return rasterImageCache[key];
}

function createHalftonePng(effect) {
  const width = 128;
  const height = 128;
  const spacing = Math.max(1, effect.spacing);
  const radius = Math.max(0.25, effect.dotSize / 2);
  const color = hexToBytes(effect.color);
  const radians = effect.angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centeredX = x - width / 2;
      const centeredY = y - height / 2;
      const rx = centeredX * cos - centeredY * sin;
      const ry = centeredX * sin + centeredY * cos;
      const cellX = positiveModulo(rx + spacing / 2, spacing) - spacing / 2;
      const cellY = positiveModulo(ry + spacing / 2, spacing) - spacing / 2;
      const inside = Math.sqrt(cellX * cellX + cellY * cellY) <= radius;
      const index = (y * width + x) * 4;
      rgba[index] = color[0];
      rgba[index + 1] = color[1];
      rgba[index + 2] = color[2];
      rgba[index + 3] = inside ? 255 : 0;
    }
  }

  return encodePng(width, height, rgba);
}

function scribbleImagePaint(effect) {
  return {
    type: "IMAGE",
    visible: true,
    scaleMode: "TILE",
    imageHash: scribbleImageHash(effect),
    scalingFactor: 1,
    opacity: effect.opacity / 100,
    blendMode: effect.blendMode
  };
}

function scribbleImageHash(effect) {
  const key = [
    "scribble",
    effect.color,
    effect.strokeWidth,
    effect.gap,
    effect.angle,
    effect.jitter
  ].join("|");
  if (!rasterImageCache[key]) {
    rasterImageCache[key] = figma.createImage(createScribblePng(effect)).hash;
  }
  return rasterImageCache[key];
}

function createScribblePng(effect) {
  const width = 128;
  const height = 128;
  const gap = Math.max(1, effect.gap);
  const stroke = Math.max(0.1, effect.strokeWidth);
  const jitter = Math.max(0, effect.jitter);
  const color = hexToBytes(effect.color);
  const radians = effect.angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centeredX = x - width / 2;
      const centeredY = y - height / 2;
      const rx = centeredX * cos - centeredY * sin;
      const ry = centeredX * sin + centeredY * cos;
      const wobble = Math.sin(rx * 0.11) * jitter + Math.sin(rx * 0.031 + 1.7) * jitter * 0.6;
      const distance = Math.abs(positiveModulo(ry + wobble + gap / 2, gap) - gap / 2);
      const inside = distance <= stroke / 2;
      const index = (y * width + x) * 4;
      rgba[index] = color[0];
      rgba[index + 1] = color[1];
      rgba[index + 2] = color[2];
      rgba[index + 3] = inside ? 255 : 0;
    }
  }

  return encodePng(width, height, rgba);
}

function createNoisePng(effect) {
  const width = 128;
  const height = 128;
  const grainSize = Math.max(1, Math.round(effect.noiseSize));
  const density = Math.max(0, Math.min(1, effect.density / 100));
  const primary = hexToBytes(effect.color);
  const secondary = hexToBytes(effect.secondaryColor);
  const seed = hashString([effect.noiseType, effect.color, effect.secondaryColor, effect.density, effect.noiseSize].join("|"));
  const random = seededRandom(seed);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += grainSize) {
    for (let x = 0; x < width; x += grainSize) {
      const active = random() <= density;
      const color = noiseCellColor(effect, primary, secondary, random);
      const alpha = active ? 255 : 0;
      for (let yy = y; yy < Math.min(height, y + grainSize); yy++) {
        for (let xx = x; xx < Math.min(width, x + grainSize); xx++) {
          const index = (yy * width + xx) * 4;
          rgba[index] = color[0];
          rgba[index + 1] = color[1];
          rgba[index + 2] = color[2];
          rgba[index + 3] = alpha;
        }
      }
    }
  }

  return encodePng(width, height, rgba);
}

function noiseCellColor(effect, primary, secondary, random) {
  if (effect.noiseType === "DUOTONE") {
    return random() < 0.5 ? primary : secondary;
  }

  if (effect.noiseType === "MULTITONE") {
    const value = Math.round(random() * 255);
    return [value, value, value];
  }

  return primary;
}

function hexToBytes(hex) {
  const rgb = hexToRgb(hex);
  return [
    Math.round(rgb.r * 255),
    Math.round(rgb.g * 255),
    Math.round(rgb.b * 255)
  ];
}

function clonePaint(paint) {
  return JSON.parse(JSON.stringify(paint));
}

function assignEffects(node, effects) {
  try {
    node.effects = effects;
  } catch (_error) {
    notifyUnsupportedBetaEffects(effects);
    const stableEffects = effects.filter((effect) => {
      return effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW" || effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR";
    });
    try {
      node.effects = stableEffects;
    } catch (_stableError) {
      node.effects = [];
    }
  }
}

function notifyUnsupportedBetaEffects(effects) {
  const hasBetaEffect = effects.some((effect) => {
    return effect.type === "NOISE" || effect.type === "TEXTURE" || effect.type === "GLASS";
  });
  if (hasBetaEffect) {
    if (didNotifyUnsupportedBetaEffects) return;
    didNotifyUnsupportedBetaEffects = true;
    figma.notify("This Figma build rejected a beta effect. Noise/Texture/Glass may need a newer Figma runtime.");
  }
}

function getTransformInstances(layer) {
  const transform = layer.effects.find((effect) => effect.type === "transform" && effect.visible);
  if (!transform) {
    return [{
      scaleX: 1,
      scaleY: 1,
      moveX: 0,
      moveY: 0,
      rotate: 0,
      reflectX: false,
      reflectY: false,
      label: ""
    }];
  }

  const instances = [];
  const total = transform.copies + 1;
  for (let index = 1; index <= total; index++) {
    instances.push({
      scaleX: Math.pow(transform.scaleX / 100, index),
      scaleY: Math.pow(transform.scaleY / 100, index),
      moveX: transform.moveX * index,
      moveY: transform.moveY * index,
      rotate: transform.rotate * index,
      reflectX: transform.reflectX && index % 2 === 1,
      reflectY: transform.reflectY && index % 2 === 1,
      label: index > 1 ? `copy ${index - 1}` : ""
    });
  }
  return instances;
}

function applyTransformInstance(node, transform) {
  const scaleX = (transform.reflectX ? -1 : 1) * transform.scaleX;
  const scaleY = (transform.reflectY ? -1 : 1) * transform.scaleY;
  const needsMatrix = scaleX < 0 || scaleY < 0;

  if (needsMatrix && "relativeTransform" in node) {
    try {
      node.relativeTransform = multiplyTransform(node.relativeTransform, transformMatrix(
        scaleX,
        scaleY,
        transform.rotate,
        transform.moveX,
        transform.moveY
      ));
      return;
    } catch (_error) {
      // Fall back to non-reflected transforms below when matrix assignment is not available.
    }
  }

  if ("resize" in node && "width" in node && "height" in node) {
    const nextWidth = Math.max(0.01, node.width * Math.abs(transform.scaleX));
    const nextHeight = Math.max(0.01, node.height * Math.abs(transform.scaleY));
    try {
      node.resize(nextWidth, nextHeight);
    } catch (_error) {
      // Some Figma nodes cannot be resized directly.
    }
  }

  if ("rotation" in node) {
    node.rotation += transform.rotate;
  }
  if ("x" in node) node.x += transform.moveX;
  if ("y" in node) node.y += transform.moveY;
}

function transformMatrix(scaleX, scaleY, rotate, moveX, moveY) {
  const radians = rotate * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    [cos * scaleX, -sin * scaleY, moveX],
    [sin * scaleX, cos * scaleY, moveY]
  ];
}

function multiplyTransform(a, b) {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2]
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2]
    ]
  ];
}

function normalizePrintSettings(settings) {
  const source = settings || {};
  return {
    profile: source.profile || "U.S. Web Coated (SWOP) v2",
    pdfTarget: source.pdfTarget || "PDF/X-4 intent",
    bleedMm: clampNumber(source.bleedMm, 0, 50, 3),
    safeMm: clampNumber(source.safeMm, 0, 50, 3),
    dpi: Math.round(clampNumber(source.dpi, 72, 1200, 300)),
    trimWidthMm: clampNumber(source.trimWidthMm, 1, 10000, 210),
    trimHeightMm: clampNumber(source.trimHeightMm, 1, 10000, 297),
    blackPolicy: source.blackPolicy || "100K text, rich black only for large solids"
  };
}

async function exportPrintPackage(settings) {
  const group = getActiveAppearanceGroup();
  if (!group) return notifySelectAppearance();

  const normalizedSettings = normalizePrintSettings(settings);
  const base = findBase(group);
  const stack = readStack(group);
  await renderAppearance(group, stack);

  const pdfBytes = await group.exportAsync({
    format: "PDF",
    contentsOnly: false,
    useAbsoluteBounds: false,
    colorProfile: "SRGB"
  });

  const manifest = createPrintManifest(group, base, stack, normalizedSettings);
  figma.ui.postMessage({
    type: "print-export-result",
    fileName: safeFileName(group.name || "appearance-stack"),
    pdfBytes,
    manifestText: JSON.stringify(manifest, null, 2)
  });
  figma.notify("Print source PDF and manifest are ready.");
}

function createPrintManifest(group, base, stack, settings) {
  return {
    version: 1,
    source: "Appearance Stack Figma plugin",
    warning: "Figma export is RGB. Convert this source PDF with the target ICC profile before sending to print.",
    target: {
      colorSpace: "CMYK",
      iccProfile: settings.profile,
      pdfTarget: settings.pdfTarget,
      blackPolicy: settings.blackPolicy
    },
    layout: {
      trimWidthMm: settings.trimWidthMm,
      trimHeightMm: settings.trimHeightMm,
      bleedMm: settings.bleedMm,
      safeMarginMm: settings.safeMm,
      rasterDpi: settings.dpi
    },
    figmaSource: {
      nodeName: group.name,
      baseName: base ? base.name.replace(/\sbase$/, "") : "",
      widthPx: "width" in group ? roundForUi(group.width) : 0,
      heightPx: "height" in group ? roundForUi(group.height) : 0,
      exportedColorProfile: "sRGB"
    },
    preflight: collectPrintWarnings(stack, settings)
  };
}

function collectPrintWarnings(stack, settings) {
  const warnings = [];
  warnings.push("Convert the exported PDF to CMYK outside Figma. Native Figma PDF is not a CMYK/PDF-X final.");
  if (settings.profile === "U.S. Web Coated (SWOP) v2") {
    warnings.push("SWOP v2 is a fallback profile. Ask the printer for their exact ICC profile when possible.");
  }

  for (const layer of stack) {
    if (isBrightPrintRisk(layer)) warnings.push(layer.name + " uses a bright RGB color that may shift in CMYK.");
    const effects = layer.effects || [];
    for (const effect of effects) {
      if (effect.type === "noise" || effect.type === "texture" || effect.type === "glass" || effect.type === "layerBlur" || effect.type === "backgroundBlur" || effect.type === "colorHalftone" || effect.type === "scribble" || effect.type === "feather") {
        warnings.push(layer.name + " has " + effectName(effect.type) + "; inspect raster output at " + settings.dpi + " DPI.");
      }
    }
  }

  return uniqueStrings(warnings);
}

function isBrightPrintRisk(layer) {
  const colors = [];
  if (layer.color) colors.push(layer.color);
  if (layer.gradientStart) colors.push(layer.gradientStart);
  if (layer.gradientEnd) colors.push(layer.gradientEnd);
  return colors.some((hex) => {
    const rgb = hexToRgb(hex);
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    return max > 0.88 && max - min > 0.55;
  });
}

function uniqueStrings(values) {
  const seen = {};
  const result = [];
  for (const value of values) {
    if (seen[value]) continue;
    seen[value] = true;
    result.push(value);
  }
  return result;
}

function safeFileName(value) {
  return String(value || "appearance-stack").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").toLowerCase();
}

function solidPaint(hex, opacity) {
  return {
    type: "SOLID",
    color: hexToRgb(hex),
    opacity,
    visible: true
  };
}

function gradientPaint(layer) {
  const opacity = layer.opacity / 100;
  const angle = layer.paintType === "GRADIENT_LINEAR" ? layer.gradientAngle : 0;
  const stops = Array.isArray(layer.gradientStops) && layer.gradientStops.length ? layer.gradientStops : defaultGradientStops(layer.gradientStart, layer.gradientEnd);
  return {
    type: layer.paintType,
    gradientTransform: gradientTransform(angle),
    gradientStops: stops.map(function (stop) {
      return {
        position: clampNumber(stop.position, 0, 100, 0) / 100,
        color: Object.assign({}, hexToRgb(stop.color), { a: opacity })
      };
    }),
    visible: true
  };
}

function gradientTransform(angle) {
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    [cos, sin, 0],
    [-sin, cos, 0]
  ];
}

function layerPaint(layer) {
  if (layer.paintType === "GRADIENT_LINEAR" || layer.paintType === "GRADIENT_RADIAL") {
    return gradientPaint(layer);
  }
  return solidPaint(layer.color, layer.opacity / 100);
}

function paintToHex(paint) {
  if (!paint || paint.type !== "SOLID") return null;
  return rgbToHex(paint.color.r, paint.color.g, paint.color.b);
}

function gradientStopToHex(stop) {
  if (!stop || !stop.color) return null;
  return rgbToHex(stop.color.r, stop.color.g, stop.color.b);
}

function paintOpacity(paint) {
  if (!paint) return 1;
  if (typeof paint.opacity === "number") return paint.opacity;
  if (paint.gradientStops && paint.gradientStops[0] && paint.gradientStops[0].color && typeof paint.gradientStops[0].color.a === "number") {
    return paint.gradientStops[0].color.a;
  }
  return 1;
}

function findSupportedPaint(paints) {
  return paints.find((paint) => PAINT_TYPES.includes(paint.type)) || null;
}

function paintToLayerFields(paint, fallbackColor) {
  if (!paint) {
    return {
      paintType: "SOLID",
      color: fallbackColor,
      gradientStart: fallbackColor,
      gradientEnd: DEFAULT_GRADIENT_END,
      gradientAngle: 0
    };
  }

  if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL") {
    const stops = Array.isArray(paint.gradientStops) ? paint.gradientStops : [];
    const start = gradientStopToHex(stops[0]) || fallbackColor;
    const end = gradientStopToHex(stops[stops.length - 1]) || DEFAULT_GRADIENT_END;
    return {
      paintType: paint.type,
      color: start,
      gradientStart: start,
      gradientEnd: end,
      gradientStops: stops.length ? stops.map(function (stop) {
        return {
          id: createId(),
          position: clampNumber(Number(stop.position) * 100, 0, 100, 0),
          color: gradientStopToHex(stop) || start
        };
      }) : defaultGradientStops(start, end),
      gradientAngle: 0
    };
  }

  const color = paintToHex(paint) || fallbackColor;
  return {
    paintType: "SOLID",
    color,
    gradientStart: color,
    gradientEnd: DEFAULT_GRADIENT_END,
    gradientStops: defaultGradientStops(color, DEFAULT_GRADIENT_END),
    gradientAngle: 0
  };
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex).replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255
  };
}

function rgbToHex(r, g, b) {
  const parts = [r, g, b].map((value) => Math.round(value * 255).toString(16).padStart(2, "0"));
  return `#${parts.join("").toUpperCase()}`;
}

function normalizeHex(value, fallback) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
  }
  return fallback || DEFAULT_FILL;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeBlendMode(value) {
  return BLEND_MODES.includes(value) ? value : "NORMAL";
}

function normalizePaintType(value) {
  return PAINT_TYPES.includes(value) ? value : "SOLID";
}

function normalizeNoiseType(value) {
  return ["MONOTONE", "DUOTONE", "MULTITONE"].includes(value) ? value : "MONOTONE";
}

function normalizeShapeEffectType(value) {
  return SHAPE_EFFECT_TYPES.includes(value) ? value : "RECTANGLE";
}

function normalizeOffsetJoin(value) {
  return OFFSET_JOINS.includes(value) ? value : "MITER";
}

function normalizeWarpStyle(value) {
  return WARP_STYLES.includes(value) ? value : "ARC";
}

function normalizeWarpAxis(value) {
  return WARP_AXES.includes(value) ? value : "HORIZONTAL";
}

function normalizeBlendSpacingMode(value) {
  return BLEND_SPACING_MODES.includes(value) ? value : "SPECIFIED_STEPS";
}

function defaultEffectOpacity(type) {
  if (type === "innerShadow") return 24;
  if (type === "outerGlow") return 65;
  if (type === "innerGlow") return 55;
  if (type === "noise") return 22;
  if (type === "colorHalftone") return 45;
  if (type === "scribble") return 65;
  return 28;
}

function defaultEffectOffsetY(type) {
  if (type === "innerShadow") return 3;
  if (type === "outerGlow" || type === "innerGlow") return 0;
  return 8;
}

function defaultEffectRadius(type) {
  if (type === "layerBlur") return 8;
  if (type === "backgroundBlur") return 12;
  if (type === "innerShadow") return 8;
  if (type === "outerGlow") return 18;
  if (type === "innerGlow") return 14;
  if (type === "texture") return 4;
  if (type === "glass") return 8;
  if (type === "feather") return 8;
  if (type === "roundCorners") return 12;
  return 18;
}

function normalizeOptionalEnum(value, options) {
  if (value === "" || value === undefined || value === null) return "";
  return options.includes(value) ? value : "";
}

function normalizeDashPattern(value) {
  if (Array.isArray(value)) {
    return value.map((item) => clampNumber(item, 0, 1000, 0)).filter((item) => item > 0);
  }

  if (typeof value === "string") {
    return value.split(/[,\s]+/).map((item) => clampNumber(item, 0, 1000, 0)).filter((item) => item > 0);
  }

  return [];
}

function getNodeBlendMode(node) {
  return "blendMode" in node ? normalizeBlendMode(node.blendMode) : "NORMAL";
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function effectName(type) {
  if (type === "dropShadow") return "Drop Shadow";
  if (type === "innerShadow") return "Inner Shadow";
  if (type === "outerGlow") return "Outer Glow";
  if (type === "innerGlow") return "Inner Glow";
  if (type === "layerBlur") return "Layer Blur";
  if (type === "backgroundBlur") return "Background Blur";
  if (type === "noise") return "Noise";
  if (type === "texture") return "Texture";
  if (type === "glass") return "Glass";
  if (type === "transform") return "Transform";
  if (type === "offsetPath") return "Offset Path";
  if (type === "roundCorners") return "Round Corners";
  if (type === "feather") return "Feather";
  if (type === "convertShape") return "Convert to Shape";
  if (type === "colorHalftone") return "Color Halftone";
  if (type === "scribble") return "Scribble";
  if (type === "warp") return "Warp";
  return titleCase(type);
}

function positiveModulo(value, size) {
  return ((value % size) + size) % size;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed || 1;
  return function () {
    value += 0x6D2B79F5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const rawRow = y * stride;
    const rgbaRow = y * width * 4;
    raw[rawRow] = 0;
    raw.set(rgba.subarray(rgbaRow, rgbaRow + width * 4), rawRow + 1);
  }

  const compressed = zlibStore(raw);
  const chunks = [
    pngChunk("IHDR", pngIhdr(width, height)),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0))
  ];
  return concatBytes([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])].concat(chunks));
}

function pngIhdr(width, height) {
  const bytes = new Uint8Array(13);
  writeUint32(bytes, 0, width);
  writeUint32(bytes, 4, height);
  bytes[8] = 8;
  bytes[9] = 6;
  bytes[10] = 0;
  bytes[11] = 0;
  bytes[12] = 0;
  return bytes;
}

function pngChunk(type, data) {
  const typeBytes = asciiBytes(type);
  const bytes = new Uint8Array(12 + data.length);
  writeUint32(bytes, 0, data.length);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  writeUint32(bytes, 8 + data.length, crc32(concatBytes([typeBytes, data])));
  return bytes;
}

function zlibStore(data) {
  const blocks = [];
  let offset = 0;
  while (offset < data.length) {
    const length = Math.min(65535, data.length - offset);
    const finalBlock = offset + length >= data.length;
    const block = new Uint8Array(5 + length);
    block[0] = finalBlock ? 1 : 0;
    block[1] = length & 255;
    block[2] = length >>> 8 & 255;
    const nlen = (~length) & 65535;
    block[3] = nlen & 255;
    block[4] = nlen >>> 8 & 255;
    block.set(data.subarray(offset, offset + length), 5);
    blocks.push(block);
    offset += length;
  }

  const adler = adler32(data);
  const trailer = new Uint8Array(4);
  writeUint32(trailer, 0, adler);
  return concatBytes([new Uint8Array([120, 1])].concat(blocks).concat([trailer]));
}

function asciiBytes(value) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index++) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = value >>> 24 & 255;
  bytes[offset + 1] = value >>> 16 & 255;
  bytes[offset + 2] = value >>> 8 & 255;
  bytes[offset + 3] = value & 255;
}

function adler32(data) {
  let a = 1;
  let b = 0;
  for (let index = 0; index < data.length; index++) {
    a = (a + data[index]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let index = 0; index < data.length; index++) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xEDB88320 ^ crc >>> 1 : crc >>> 1;
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

figma.showUI(__html__, { width: 460, height: 760, themeColors: true });

let availableFonts = [];

loadAvailableFonts();
loadSavedSwatches();

figma.on("selectionchange", () => {
  sendSelectionState();
});

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === "wrap-selection") {
      await wrapSelection();
      sendSelectionState();
    }

    if (message.type === "detach") {
      await detachAppearance();
      sendSelectionState();
    }

    if (message.type === "close-plugin") {
      figma.closePlugin();
    }

    if (message.type === "resize-ui") {
      const width = clampNumber(message.width, 280, 1200, 460);
      const height = clampNumber(message.height, 240, 1200, 760);
      figma.ui.resize(width, height);
    }

    if (message.type === "request-3d-source") {
      await sendThreeDSource();
    }

    if (message.type === "request-3d-source-by-id") {
      await sendThreeDSourceById(message.nodeId || "", message.renderNodeId || "");
    }

    if (message.type === "place-3d-render") {
      await placeThreeDRender(message);
      sendSelectionState();
    }

    if (message.type === "update-text") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const base = findBase(group);
      if (!base || base.type !== "TEXT") {
        figma.notify("This appearance stack is not a text object.");
        return;
      }
      await setTextContent(base, message.characters || "");
      await renderAppearance(group, readStack(group));
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "update-text-style") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const base = findBase(group);
      if (!base || base.type !== "TEXT") {
        figma.notify("This appearance stack is not a text object.");
        return;
      }
      await applyTextProperties(base, message.textProperties || {});
      await renderAppearance(group, readStack(group));
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "update-global") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const globalAppearance = normalizeGlobalAppearance(Object.assign({}, readGlobalAppearance(group), message.globalAppearance));
      writeGlobalAppearance(group, globalAppearance);
      applyGlobalAppearance(group, globalAppearance);
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "update-object-properties") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const base = findBase(group);
      if (!base) return notifySelectAppearance();
      applyObjectProperties(group, base, message.objectProperties || {});
      await renderAppearance(group, readStack(group));
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "export-print-package") {
      await exportPrintPackage(message.printSettings || {});
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "blend-make") {
      await makeBlend();
      sendSelectionState();
    }

    if (message.type === "blend-release") {
      await releaseBlend();
      sendSelectionState();
    }

    if (message.type === "blend-expand") {
      await expandBlend();
      sendSelectionState();
    }

    if (message.type === "blend-reverse-front-to-back") {
      await reverseBlendFrontToBack();
      sendSelectionState();
    }

    if (message.type === "blend-toggle-edit-endpoints") {
      await toggleBlendEndpointEditMode();
      sendSelectionState();
    }

    if (message.type === "blend-select-start") {
      await selectBlendEndpoint(BLEND_ROLE_START);
      sendSelectionState();
    }

    if (message.type === "blend-select-end") {
      await selectBlendEndpoint(BLEND_ROLE_END);
      sendSelectionState();
    }

    if (message.type === "blend-update") {
      await updateActiveBlend();
      sendSelectionState();
    }

    if (message.type === "blend-update-options") {
      const group = getActiveBlendGroup();
      if (!group) return notifySelectBlend();
      await updateBlendOptions(group, message.blendOptions || {});
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "save-swatch") {
      await saveSwatchFromLayer(message.layerId || "");
      sendSelectionState();
    }

    if (message.type === "save-selection-swatch") {
      await saveSwatchFromSelection();
      sendSelectionState();
    }

    if (message.type === "create-swatch") {
      await createSavedSwatch(message.swatch || {});
      sendSelectionState();
    }

    if (message.type === "remove-swatch") {
      await removeSavedSwatch(message.swatchId || "");
      sendSelectionState();
    }

    if (message.type === "apply-swatch") {
      await applySavedSwatch(message.layerId || "", message.swatchId || "");
      sendSelectionState();
    }

    if (message.type === "simplify-path") {
      await simplifySelectedPath(message.tolerance);
      sendSelectionState();
    }

    if (message.type === "smooth-path") {
      await smoothSelectedPath(message.amount);
      sendSelectionState();
    }

    if (message.type === "object-path-preview-start") {
      await startObjectPathPreview(message.tool, message.value);
      sendSelectionState();
    }

    if (message.type === "object-path-preview-update") {
      await updateObjectPathPreview(message.value);
      sendSelectionState();
    }

    if (message.type === "object-path-preview-commit") {
      commitObjectPathPreview();
      sendSelectionState();
    }

    if (message.type === "object-path-preview-cancel") {
      await cancelObjectPathPreview();
      sendSelectionState();
    }

    if (message.type === "add-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      stack.push(createLayer(message.layerKind));
      await renderAppearance(group, stack);
      sendSelectionState();
    }

    if (message.type === "add-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layerId);
      if (index >= 0) {
        if (message.effectKind === "transform" && stack[index].effects.some((effect) => effect.type === "transform")) {
          figma.notify("This stack already has a Transform effect.");
          sendSelectionState();
          return;
        }
        stack[index].effects.push(createEffect(message.effectKind));
        figma.currentPage.selection = [group];
        await renderAppearance(group, stack);
        figma.currentPage.selection = [group];
      }
      sendSelectionState();
    }

    if (message.type === "update-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const layer = stack.find((item) => item.id === message.layerId);
      if (layer) {
        const effectIndex = layer.effects.findIndex((effect) => effect.id === message.effect.id);
        if (effectIndex >= 0) {
          layer.effects[effectIndex] = normalizeEffect(Object.assign({}, layer.effects[effectIndex], message.effect));
          await renderAppearance(group, stack);
        }
      }
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "remove-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const layer = stack.find((item) => item.id === message.layerId);
      if (layer) {
        layer.effects = layer.effects.filter((effect) => effect.id !== message.effectId);
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "update-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layer.id);
      if (index >= 0) {
        stack[index] = normalizeLayer(Object.assign({}, stack[index], message.layer));
        await renderAppearance(group, stack);
      }
      if (!message.silent) sendSelectionState();
    }

    if (message.type === "remove-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group).filter((layer) => layer.id !== message.layerId);
      await renderAppearance(group, stack);
      sendSelectionState();
    }

    if (message.type === "clear-appearance") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      writeGlobalAppearance(group, createGlobalAppearance());
      await renderAppearance(group, []);
      sendSelectionState();
    }

    if (message.type === "copy-style") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      await figma.clientStorage.setAsync(STYLE_CLIPBOARD_KEY, {
        stack: readStack(group),
        globalAppearance: readGlobalAppearance(group)
      });
      figma.notify("Appearance copied.");
      sendSelectionState();
    }

    if (message.type === "paste-style") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = await figma.clientStorage.getAsync(STYLE_CLIPBOARD_KEY);
      if (!Array.isArray(stack)) {
        if (!stack || !Array.isArray(stack.stack)) {
          figma.notify("No copied appearance yet.");
          return;
        }
        writeGlobalAppearance(group, normalizeGlobalAppearance(stack.globalAppearance));
        await renderAppearance(group, stack.stack.map(cloneLayerForPaste));
      } else {
        writeGlobalAppearance(group, createGlobalAppearance());
        await renderAppearance(group, stack.map(cloneLayerForPaste));
      }
      figma.notify("Appearance pasted.");
      sendSelectionState();
    }

    if (message.type === "reduce-basic") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = reduceToBasic(readStack(group));
      writeGlobalAppearance(group, createGlobalAppearance());
      await renderAppearance(group, stack);
      sendSelectionState();
    }

    if (message.type === "duplicate-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layerId);
      if (index >= 0) {
        stack.splice(index + 1, 0, normalizeLayer(Object.assign({}, stack[index], {
          id: createId(),
          name: `${stack[index].name} copy`
        })));
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "move-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const index = stack.findIndex((layer) => layer.id === message.layerId);
      const next = index + message.direction;
      if (index >= 0 && next >= 0 && next < stack.length) {
        const [layer] = stack.splice(index, 1);
        stack.splice(next, 0, layer);
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "reorder-layer") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const from = stack.findIndex((layer) => layer.id === message.layerId);
      const before = message.beforeLayerId ? stack.findIndex((layer) => layer.id === message.beforeLayerId) : -1;
      const after = message.afterLayerId ? stack.findIndex((layer) => layer.id === message.afterLayerId) : -1;
      if (from >= 0) {
        const layer = stack.splice(from, 1)[0];
        const adjustedAfter = after >= 0 && from < after ? after - 1 : after;
        const adjustedBefore = before >= 0 && from < before ? before - 1 : before;
        if (adjustedAfter >= 0) {
          stack.splice(adjustedAfter + 1, 0, layer);
        } else if (adjustedBefore >= 0) {
          stack.splice(adjustedBefore, 0, layer);
        } else {
          stack.push(layer);
        }
        await renderAppearance(group, stack);
      }
      sendSelectionState();
    }

    if (message.type === "reorder-effect") {
      const group = getActiveAppearanceGroup();
      if (!group) return notifySelectAppearance();
      const stack = readStack(group);
      const layer = stack.find((l) => l.id === message.layerId);
      if (layer && layer.effects) {
        const effects = layer.effects;
        const fromIdx = effects.findIndex((e) => e.id === message.effectId);
        const toIdx = effects.findIndex((e) => e.id === message.beforeEffectId);
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
          const moved = effects.splice(fromIdx, 1)[0];
          effects.splice(toIdx, 0, moved);
          await renderAppearance(group, stack);
        }
      }
      sendSelectionState();
    }
  } catch (error) {
    figma.notify(error && error.message ? error.message : "Appearance Stack hit an error.");
  }
};

async function loadAvailableFonts() {
  if (typeof figma.listAvailableFontsAsync !== "function") {
    sendSelectionState();
    return;
  }

  try {
    const fonts = await figma.listAvailableFontsAsync();
    availableFonts = fonts.map((font) => {
      return {
        family: font.fontName.family,
        style: font.fontName.style
      };
    }).sort((a, b) => {
      const familySort = a.family.localeCompare(b.family);
      return familySort || a.style.localeCompare(b.style);
    });
  } catch (_error) {
    availableFonts = [];
  }
  sendSelectionState();
}

function sendSelectionState() {
  const selection = figma.currentPage.selection;
  const group = getActiveAppearanceGroup();
  const blendGroup = getActiveBlendGroup();
  const base = group ? findBase(group) : null;
  figma.ui.postMessage({
    type: "selection-state",
    hasSelection: selection.length > 0,
    selectedCount: selection.length,
    isAppearance: Boolean(group),
    groupName: group ? group.name : "",
    baseName: base ? base.name.replace(/\sbase$/, "") : "",
    baseType: base ? base.type : "",
    isTextBase: Boolean(base && base.type === "TEXT"),
    textContent: base && base.type === "TEXT" ? base.characters : "",
    textProperties: base && base.type === "TEXT" ? readTextProperties(base) : null,
    availableFonts,
    objectProperties: group && base ? readObjectProperties(group, base) : null,
    globalAppearance: group ? readGlobalAppearance(group) : createGlobalAppearance(),
    stack: group ? readStack(group) : [],
    isBlend: Boolean(blendGroup),
    blendName: blendGroup ? blendGroup.name : "",
    blendOptions: blendGroup ? readBlendOptions(blendGroup) : createBlendOptions(),
    swatches: savedSwatches,
    objectPathDebug: readObjectPathDebug()
  });
}

sendSelectionState();
